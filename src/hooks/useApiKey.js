import { useSyncExternalStore } from 'react';
import {
  clearUserApiKey,
  hasApiKey,
  setUserApiKey,
  subscribeApiKey,
} from '../api/openrouter';
import {
  clearUserXapiKey,
  hasXapiKey,
  setUserXapiKey,
  subscribeXapiKey,
} from '../pipeline/xapi';

// Subscribes to the in-memory OpenRouter key held in `api/openrouter.js`.
// Returns the current presence flag plus setters; the actual key value is
// never exposed to React state to keep it out of devtools snapshots.
export function useApiKey() {
  const hasKey = useSyncExternalStore(subscribeApiKey, hasApiKey, () => false);
  return {
    hasKey,
    setKey: setUserApiKey,
    clearKey: clearUserApiKey,
  };
}

// Optional xAPI (X / Twitter enrichment) key. Same in-memory pattern, but the
// key is purely optional — enrichment is silently skipped when absent.
export function useXapiKey() {
  const hasKey = useSyncExternalStore(subscribeXapiKey, hasXapiKey, () => false);
  return {
    hasKey,
    setKey: setUserXapiKey,
    clearKey: clearUserXapiKey,
  };
}
