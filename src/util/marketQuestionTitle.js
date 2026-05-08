const TITLE_LIMIT = 70;

const DISALLOWED_PATTERNS = Object.freeze([
  {
    re: /https?:\/\//i,
    reason: 'must not include URLs',
  },
  {
    re: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    reason: 'must not include ISO timestamps',
  },
  {
    re: /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*(?:UTC|ET|EST|EDT|GMT)\b/i,
    reason: 'must not include exact clock times',
  },
  // Multi-word resolver phrases only — bare verbs like "resolve" / "resolved"
  // appear in legitimate trader-facing questions ("Will Congress resolve the
  // debt ceiling…?") and matched too aggressively in earlier iterations.
  {
    re: /\b(?:according to|as confirmed by|as measured by|resolution source|resolution criteria|resolves to|resolves as|will resolve|oracle|outcome token|parimutuel|MECE|42\.space)\b/i,
    reason: 'must keep resolver mechanics out of the title',
  },
]);

// Stiff resolver phrasing that feels bureaucratic to a trader-facing audience.
// Kept conservative so legitimate trader questions still pass.
const TRADER_TITLE_DISALLOWED_PATTERNS = Object.freeze([
  {
    re: /\bofficial\s+(?:result|results|source|sources)\b/i,
    reason: 'title should not lean on resolver-style "official source/result" phrasing',
  },
  {
    re: /\bas of\b/i,
    reason: 'title should not include resolver "as of" cutoffs',
  },
  {
    re: /\bby\s+(?:the\s+)?market\s+close\b/i,
    reason: 'title should not reference "market close"',
  },
  {
    re: /\bbased\s+on\b/i,
    reason: 'title should not start a resolver clause with "based on"',
  },
  {
    re: /\bconfirmed\s+by\b/i,
    reason: 'title should not include "confirmed by" resolver phrasing',
  },
  {
    re: /\bpublished\s+by\s+the\s+source\b/i,
    reason: 'title should not include "published by the source" resolver phrasing',
  },
]);

function oneLine(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function getMarketQuestionTitleLimit(_rigor = 'human') {
  return TITLE_LIMIT;
}

export function validateMarketQuestionTitle(title, _rigor = 'human') {
  const normalized = oneLine(title);
  const maxChars = getMarketQuestionTitleLimit();
  const reasons = [];

  if (!normalized) {
    reasons.push('missing title');
  }

  if (normalized.length > maxChars) {
    reasons.push(`too long (${normalized.length}/${maxChars} chars)`);
  }

  const questionMarks = (normalized.match(/\?/g) || []).length;
  if (questionMarks !== 1 || !normalized.endsWith('?')) {
    reasons.push('must be one question ending in ?');
  }

  for (const { re, reason } of DISALLOWED_PATTERNS) {
    if (re.test(normalized)) reasons.push(reason);
  }

  for (const { re, reason } of TRADER_TITLE_DISALLOWED_PATTERNS) {
    if (re.test(normalized)) reasons.push(reason);
  }

  return {
    valid: reasons.length === 0,
    reasons,
    normalized,
    maxChars,
  };
}
