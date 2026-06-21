const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

// API key resolution:
//   - Browser: the user enters their own OpenRouter API key via the
//     <ApiKeyGate> UI; we hold it in module-level memory only. No env vars
//     are read at build time, so a stray .env can never get inlined into the
//     public bundle. No localStorage / cookie either — refreshing the page
//     clears it.
//   - Node (CLI, eval harness, HTTP service): reads OPENROUTER_API_KEY from
//     process.env. No VITE_-prefixed fallbacks; the browser path never has
//     access to those anyway, and stripping them avoids accidentally
//     reintroducing the build-time inlining bug.
const CLI_API_KEY_ENV = 'OPENROUTER_API_KEY';

// User-supplied browser key. Never persisted. Cleared on reload by virtue of
// living only in memory.
let _userApiKey = null;
const _keyListeners = new Set();

function isBrowser() {
  return typeof window !== 'undefined';
}

/**
 * Set the user-supplied OpenRouter API key for the browser session. Only
 * called by the <ApiKeyGate> UI component. The key is held in memory only
 * and never written to storage.
 */
export function setUserApiKey(key) {
  _userApiKey = typeof key === 'string' && key.trim() !== '' ? key.trim() : null;
  for (const fn of _keyListeners) fn();
}

/** Forget the user-supplied API key (e.g. so they can paste a new one). */
export function clearUserApiKey() {
  _userApiKey = null;
  for (const fn of _keyListeners) fn();
}

/**
 * In the browser, returns true once the user has supplied a key via the gate
 * UI. In Node, returns true if OPENROUTER_API_KEY is set in process.env.
 */
export function hasApiKey() {
  return readConfiguredApiKey() !== null;
}

/**
 * Subscribe to changes in the user-supplied key. Returns an unsubscribe fn.
 * The <useApiKey> hook wires this up to useSyncExternalStore so React
 * components rerender when the key arrives or is cleared.
 */
export function subscribeApiKey(listener) {
  _keyListeners.add(listener);
  return () => _keyListeners.delete(listener);
}

function readConfiguredApiKey() {
  if (isBrowser()) {
    return _userApiKey;
  }
  // Node only. We deliberately do NOT read import.meta.env here so that a
  // browser bundle never embeds an API key from a .env file.
  if (typeof process !== 'undefined' && process.env?.[CLI_API_KEY_ENV]) {
    const v = process.env[CLI_API_KEY_ENV];
    if (v && v !== 'YOUR_API_KEY_HERE') return v;
  }
  return null;
}

// Referer header is only meaningful when running in a browser. In Node
// (eval harness) we fall back to a stable constant so the request still
// carries a non-empty X-* identifier.
function getRefererOrigin() {
  if (typeof window !== 'undefined' && window?.location?.origin) {
    return window.location.origin;
  }
  return 'https://pm-tools.local';
}

function getApiKey() {
  const apiKey = readConfiguredApiKey();
  if (!apiKey) {
    if (isBrowser()) {
      throw new Error(
        'OpenRouter API key required. Paste your key into the prompt at the top of the page.'
      );
    }
    throw new Error(
      `OpenRouter API key not configured. Set ${CLI_API_KEY_ENV} in your environment.`
    );
  }
  return apiKey;
}

function isRetryable(status) {
  return status === 429 || status >= 500;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalised usage object. OpenRouter forwards the upstream provider's
 * usage counters but some models omit fields — we coerce to zero so
 * downstream cost accounting never blows up on undefined arithmetic.
 *
 * @typedef {{promptTokens:number, completionTokens:number, totalTokens:number}} Usage
 */

/**
 * @typedef {Object} ModelResult
 * @property {string} content           the raw assistant message text
 * @property {Usage} usage              normalised token usage
 * @property {number} wallClockMs       client-measured duration including retries
 */

function normalizeUsage(raw) {
  const promptTokens = Number(raw?.prompt_tokens) || 0;
  const completionTokens = Number(raw?.completion_tokens) || 0;
  const totalTokens = Number(raw?.total_tokens) || promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

/**
 * Query a single model via OpenRouter with retry and exponential backoff.
 *
 * Phase 1: returns a structured ModelResult so callers can plumb usage and
 * wall-clock timing into the Run artifact's cost accounting. Callers should
 * destructure `.content` instead of treating the return as a bare string.
 *
 * Phase 6: the public `queryModel` export delegates through a mutable
 * implementation pointer so the eval harness can install a deterministic
 * mock via `installQueryModel(fn)` without any pipeline module changes.
 * `realQueryModel` (below) is the network-hitting implementation; the
 * exported `queryModel` just forwards to whichever function is currently
 * installed.
 *
 * @returns {Promise<ModelResult>}
 */
async function realQueryModel(model, messages, { temperature = 0.7, maxTokens = 3000 } = {}) {
  const apiKey = getApiKey();
  const startedAt = Date.now();
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': getRefererOrigin(),
          'X-Title': 'Market Creator',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `API error ${response.status}`;

        if (isRetryable(response.status) && attempt < MAX_RETRIES) {
          lastError = new Error(errorMsg);
          await sleep(RETRY_DELAYS[attempt]);
          continue;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('Model returned an empty or malformed response');
      }
      return {
        content,
        usage: normalizeUsage(data?.usage),
        wallClockMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (err.name === 'TypeError' && attempt < MAX_RETRIES) {
        // Network error — retry
        lastError = err;
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

// Mutable pointer for dependency-injected queryModel. Defaults to the real
// OpenRouter client; the eval harness swaps in a mock via installQueryModel.
let _queryModelImpl = realQueryModel;

/**
 * Install a custom queryModel implementation. Used by `eval/run.js` to
 * plug in a deterministic mock for regression runs. The UI never calls
 * this. `fn` must match the realQueryModel signature and return a
 * `{content, usage, wallClockMs}` ModelResult.
 *
 * @param {(model:string, messages:Array, options?:object) => Promise<ModelResult>} fn
 */
export function installQueryModel(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('installQueryModel: fn must be a function');
  }
  _queryModelImpl = fn;
}

/**
 * Restore the default (real OpenRouter) queryModel implementation.
 * Called by tests to unwind after installQueryModel.
 */
export function resetQueryModel() {
  _queryModelImpl = realQueryModel;
}

/**
 * Public queryModel entry point. Delegates through `_queryModelImpl` so
 * the eval harness can inject a mock without pipeline-module edits.
 *
 * @param {string} model
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [options]
 * @returns {Promise<ModelResult>}
 */
export function queryModel(model, messages, options) {
  return _queryModelImpl(model, messages, options);
}

/**
 * Fetch the full list of models currently available via OpenRouter.
 * The /models endpoint is public, so the API key is optional but sent when present.
 * Returns the raw `data` array (each item has id, name, description, architecture, etc.).
 */
export async function fetchAvailableModels() {
  const headers = {
    'HTTP-Referer': getRefererOrigin(),
    'X-Title': 'Market Creator',
  };
  try {
    headers.Authorization = `Bearer ${getApiKey()}`;
  } catch {
    // /models works unauthenticated; continue without the header.
  }

  const response = await fetch(MODELS_URL, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: HTTP ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data?.data) ? data.data : [];
}

