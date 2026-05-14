const STANDARD_HEADINGS = [
  '## Summary',
  '## Criteria',
  '## Resolution Source',
  '## Additional Information',
];

const URL_PATTERN = /https?:\/\/[^\s)\]}>"']+/gi;

function toText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join('\n');
  if (typeof value === 'object') return Object.values(value).map(toText).filter(Boolean).join('\n');
  return '';
}

function oneLine(value) {
  return toText(value).replace(/\s+/g, ' ').trim();
}

function stripLeadingListMarker(value) {
  return oneLine(value).replace(/^(?:[-*]|\d+[.)])\s+/, '');
}

function firstSentence(value) {
  const text = stripLeadingListMarker(value);
  if (!text) return '';
  const match = text.match(/^.*?[.!?](?:\s|$)/);
  return (match ? match[0] : text).trim();
}

function withoutBareUrls(value) {
  return oneLine(value).replace(URL_PATTERN, 'the linked source');
}

function stripTrailingUrlPunctuation(url) {
  return url.replace(/[.,;:!?]+$/g, '');
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

function normalizeLanguageCode(code) {
  const normalized = oneLine(code).toLowerCase();
  return /^[a-z]{2}$/.test(normalized) ? normalized : 'en';
}

function normalizeMarkdown(markdown) {
  return typeof markdown === 'string'
    ? markdown.trim().replace(/\r\n/g, '\n')
    : '';
}

export function isStandardResolutionDescription(markdown) {
  const normalized = normalizeMarkdown(markdown);
  // Anchor each heading at the start of a line so the H1 headings
  // (`# Summary`) don't falsely match older H2 markdown that
  // contains `## Summary` as a substring.
  const hasAllHeadings = STANDARD_HEADINGS.every((heading) => {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\n)${escaped}(?:\\n|$)`).test(normalized);
  });
  return hasAllHeadings
    && normalized.includes('---')
    && /_Language:\s*[a-z]{2}_/i.test(normalized);
}

function buildSummarySentence(finalJson) {
  const question = oneLine(finalJson?.refinedQuestion || finalJson?.question);
  const end = oneLine(finalJson?.marketEndTimeUTC);
  const period = end
    ? `at the UTC index timestamp ${end}`
    : 'at the UTC index timestamp specified in the resolution rules';

  if (question) {
    return `${question} resolves to the named outcome whose condition is met ${period}.`;
  }
  return `Resolution is determined by the named outcome whose condition is met ${period}.`;
}

function buildCriteria(finalJson) {
  const criteria = withoutBareUrls(
    firstSentence(finalJson?.outcomes?.[0]?.resolutionCriteria)
      || firstSentence(finalJson?.fullResolutionRules),
  );
  const start = oneLine(finalJson?.marketStartTimeUTC);
  const end = oneLine(finalJson?.marketEndTimeUTC);
  const window = start && end
    ? `Eligible read window: ${start} through ${end} UTC.`
    : 'Eligible read window: per the UTC timestamps in the resolution rules.';

  if (criteria) {
    return `${criteria} ${window}`;
  }
  return `Verify the named outcome against the official rules listed in the draft. ${window}`;
}

function buildResolutionSource(finalJson) {
  // Try to pull two distinct URLs so we can render primary + secondary.
  const allText = [
    finalJson?.resolutionDescriptionMarkdown,
    finalJson?.resolutionSourceUrl,
    finalJson?.resolutionSecondarySourceUrl,
    finalJson?.fullResolutionRules,
    finalJson?.outcomes,
    finalJson?.edgeCases,
  ];
  const seen = new Set();
  const urls = [];
  for (const value of allText) {
    const text = typeof value === 'string' ? value : JSON.stringify(value || '');
    const matches = text.match(URL_PATTERN) || [];
    for (const raw of matches) {
      const url = stripTrailingUrlPunctuation(raw);
      const host = hostFromUrl(url);
      if (!seen.has(host)) {
        seen.add(host);
        urls.push(url);
        if (urls.length === 2) break;
      }
    }
    if (urls.length === 2) break;
  }

  const explicitName = oneLine(finalJson?.resolutionSourceName);
  const uiParams = oneLine(finalJson?.resolutionSourceParameters || finalJson?.resolutionUiParameters);
  const paramsLine = uiParams || 'use the page state, filters, and timestamp specified in the resolution rules';

  if (urls.length === 0) {
    return `Primary source: add the external URL before dashboard submission; ${paramsLine}.`;
  }

  const primaryUrl = urls[0];
  const primaryName = explicitName || hostFromUrl(primaryUrl);
  const lines = [`Primary source — ${primaryName}: [${primaryName}](${primaryUrl}); ${paramsLine}.`];

  if (urls.length >= 2) {
    const secondaryUrl = urls[1];
    const secondaryName = hostFromUrl(secondaryUrl);
    lines.push(`Secondary source — ${secondaryName}: [${secondaryName}](${secondaryUrl}); used if the primary is unavailable or returns ambiguous data.`);
  }
  // If no secondary URL was harvested, omit the secondary line entirely —
  // a placeholder ("name a substantively different fallback…") is noise on
  // the artifact, not useful information.
  return lines.join('\n');
}

// Split a model-emitted edge-cases string into individual items. Accepts
// newline-separated numbered/bulleted lists ("1. A\n2. B"), inline numbered
// lists ("1. A. 2. B."), or a single sentence. Each returned item has any
// leading list marker stripped.
function parseListItems(text) {
  if (text == null) return [];
  const normalized = typeof text === 'string' ? text : toText(text);
  const trimmed = normalized.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return [];
  let parts = trimmed.split('\n').map((s) => s.trim()).filter(Boolean);
  // Inline-list fallback: "1. foo. 2. bar." → split before each numbered marker.
  if (parts.length === 1 && /\s\d+[.)]\s/.test(parts[0])) {
    parts = parts[0].split(/\s+(?=\d+[.)]\s)/).map((s) => s.trim()).filter(Boolean);
  }
  return parts
    .map((line) => line.replace(/^(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

function asSentence(text) {
  const trimmed = oneLine(text);
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildAdditionalInformation(finalJson) {
  const end = oneLine(finalJson?.marketEndTimeUTC);
  const items = parseListItems(finalJson?.edgeCases);
  const bullets = items.map((item) => `- ${asSentence(item)}`);

  if (bullets.length === 0) {
    bullets.push('- Apply the listed edge cases; ignore unofficial, out-of-window, or later-corrected values unless the rules state otherwise.');
  }

  const windowSentence = end
    ? `Resolution window: resolved within 24 hours after the index timestamp ${end}.`
    : 'Resolution window: resolved within 24 hours after the index timestamp.';
  bullets.push(`- ${windowSentence}`);

  return bullets.join('\n');
}

/**
 * Convert the standard resolution-description markdown into the
 * string-compacted form expected by 42.space ancillary data:
 *   - newlines encoded as the two-character sequence \n (not real LFs)
 *   - double quotes JSON-escaped as \"
 *   - exactly one blank line (\n\n) between sections, never more
 *   - no leading/trailing whitespace
 *
 * Leaves the structure (## headings, --- separator, language footer)
 * byte-for-byte stable; only encoding changes.
 */
export function compactResolutionDescriptionMarkdown(markdown) {
  if (typeof markdown !== 'string') return '';
  const normalized = markdown
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) return '';
  // JSON.stringify produces the canonical JSON escapes for " \ \n \r \t and
  // C0 control characters — exactly the escape set 42 ancillary data expects.
  // Strip the surrounding quote characters JSON.stringify adds.
  return JSON.stringify(normalized).slice(1, -1);
}

export function buildCompactedResolutionDescription(finalJson, options = {}) {
  return compactResolutionDescriptionMarkdown(
    buildResolutionDescriptionMarkdown(finalJson, options),
  );
}

export function buildResolutionDescriptionMarkdown(finalJson, options = {}) {
  const modelMarkdown = normalizeMarkdown(
    finalJson?.resolutionDescriptionMarkdown || finalJson?.descriptionMarkdown,
  );
  if (isStandardResolutionDescription(modelMarkdown)) {
    return modelMarkdown;
  }

  const language = normalizeLanguageCode(
    finalJson?.language || finalJson?.languageCode || options.language,
  );

  return [
    '## Summary',
    buildSummarySentence(finalJson),
    '',
    '## Criteria',
    buildCriteria(finalJson),
    '',
    '## Resolution Source',
    buildResolutionSource(finalJson),
    '',
    '## Additional Information',
    buildAdditionalInformation(finalJson),
    '',
    '---',
    `_Language: ${language}_`,
  ].join('\n');
}
