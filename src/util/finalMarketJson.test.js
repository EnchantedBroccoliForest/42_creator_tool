import { describe, expect, it } from 'vitest';
import {
  FINAL_PAYLOAD_MAX_BYTES,
  prepareFinalMarketPayload,
  validateFinalMarketJson,
} from './finalMarketJson.js';

const DESCRIPTION = [
  'Will Team A win resolves to one of Yes or No at 2026-01-31T23:59:59Z using Official Feed.',
  '',
  '## Resolution Criteria:',
  'Resolve using the match result at 2026-01-31T23:59:59Z UTC.',
  '',
  '## Resolution Sources:',
  'Official Feed: [official feed](https://example.com/feed); use the final score page state.',
  '',
  '## Additional Information:',
  'Apply listed edge cases and exclusions. Resolution window: resolved within 24 hours after the index timestamp.',
  '',
  '---',
  '_Language: en_',
].join('\n');

function validPayload(overrides = {}) {
  return {
    refinedQuestion: 'Will Team A win?',
    outcomes: [
      { name: 'Yes', winCondition: 'Team A wins.', resolutionCriteria: 'Use the official feed.' },
      { name: 'No', winCondition: 'Team A does not win.', resolutionCriteria: 'Use the official feed.' },
    ],
    marketStartTimeUTC: '2026-01-01T00:00:00Z',
    marketEndTimeUTC: '2026-01-31T23:59:59Z',
    shortDescription: 'Tracks whether Team A wins.',
    fullResolutionRules: '1. Resolve from https://example.com/feed.',
    edgeCases: '1. Source unavailable -> No.',
    description: DESCRIPTION,
    is_early_resolution: false,
    whitelisted: true,
    ...overrides,
  };
}

describe('validateFinalMarketJson', () => {
  it('rejects outcome names that begin with the reserved OT token prefix', () => {
    const result = validateFinalMarketJson(validPayload({
      outcomes: [
        { name: 'Below $10B' },
        { name: 'OT Below $10B' },
        { name: 'OT-Above $10B' },
        { name: 'OTBelow $10B' },
      ],
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'outcomes[1].name must not begin with reserved "OT" token prefix',
    );
    expect(result.errors).toContain('outcomes[2].name must not begin with reserved "OT" token prefix');
    expect(result.errors).toContain('outcomes[3].name must not begin with reserved "OT" token prefix');
  });

  it('allows canonical catch-all and ordinary outcome names', () => {
    const result = validateFinalMarketJson(validPayload({
      outcomes: [
        { name: 'Other / None' },
        { name: 'Below $10B' },
      ],
    }));

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('requires technical ancillary payload fields', () => {
    const result = validateFinalMarketJson(validPayload({
      description: '',
      is_early_resolution: 'false',
      whitelisted: false,
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('description is required for the compacted ancillary payload');
    expect(result.errors).toContain('is_early_resolution must be a boolean');
    expect(result.errors).toContain('whitelisted must be true');
  });

  it('rejects non-standard resolution description markdown', () => {
    const result = validateFinalMarketJson(validPayload({
      description: [
        '## Resolution Criteria:',
        'Use the source.',
        '',
        '## Resolution Sources:',
        'https://example.com/feed',
        '',
        '## Additional Information:',
        'None.',
        '',
        '---',
        '_Language: en_',
      ].join('\n'),
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('description must include at least one markdown resolution source link');
    expect(result.errors).toContain('description must follow the 42 resolution markdown standard');
  });

  it('surfaces a clear error when the prepared description has no source URL', () => {
    const prepared = prepareFinalMarketPayload({
      refinedQuestion: 'Will Team A win?',
      outcomes: [
        { name: 'Yes', winCondition: 'Team A wins.', resolutionCriteria: 'Use the official feed.' },
        { name: 'No', winCondition: 'Team A does not win.', resolutionCriteria: 'Use the official feed.' },
      ],
      marketStartTimeUTC: '2026-01-01T00:00:00Z',
      marketEndTimeUTC: '2026-01-31T23:59:59Z',
      fullResolutionRules: '1. Resolve from the official feed.',
      edgeCases: '1. Source unavailable -> No.',
    });

    const result = validateFinalMarketJson(prepared);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('description must include at least one markdown resolution source link');
  });

  it('rejects payloads above the 30KB limit', () => {
    const result = validateFinalMarketJson(validPayload({
      shortDescription: 'x'.repeat(FINAL_PAYLOAD_MAX_BYTES),
    }));

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => /payload must not exceed 30KB/.test(error))).toBe(true);
  });

  it('prepares the canonical description and fixed frontend visibility fields', () => {
    const prepared = prepareFinalMarketPayload({
      refinedQuestion: 'Will Team A win?',
      outcomes: [
        { name: 'Yes', winCondition: 'Team A wins.', resolutionCriteria: 'Use the official feed.' },
        { name: 'No', winCondition: 'Team A does not win.', resolutionCriteria: 'Use the official feed.' },
      ],
      marketStartTimeUTC: '2026-01-01T00:00:00Z',
      marketEndTimeUTC: '2026-01-31T23:59:59Z',
      fullResolutionRules: '1. Resolve from https://example.com/feed.',
      edgeCases: '1. Source unavailable -> No.',
      is_early_resolution: true,
      whitelisted: false,
    });

    expect(prepared.whitelisted).toBe(true);
    expect(prepared.is_early_resolution).toBe(true);
    expect(prepared.description).toContain('## Resolution Criteria:');
    expect(prepared.resolutionDescriptionMarkdown).toBeUndefined();
    expect(JSON.stringify(prepared)).toContain('\\n## Resolution Criteria:');
    expect(validateFinalMarketJson(prepared)).toEqual({ valid: true, errors: [] });
  });

  it('defaults missing early-resolution metadata to false during preparation', () => {
    const prepared = prepareFinalMarketPayload({
      refinedQuestion: 'Will Team A win?',
      outcomes: [
        { name: 'Yes', winCondition: 'Team A wins.', resolutionCriteria: 'Use the official feed.' },
        { name: 'No', winCondition: 'Team A does not win.', resolutionCriteria: 'Use the official feed.' },
      ],
      marketStartTimeUTC: '2026-01-01T00:00:00Z',
      marketEndTimeUTC: '2026-01-31T23:59:59Z',
      fullResolutionRules: '1. Resolve from https://example.com/feed.',
      edgeCases: '1. Source unavailable -> No.',
    });

    expect(prepared.is_early_resolution).toBe(false);
    expect(prepared.whitelisted).toBe(true);
    expect(validateFinalMarketJson(prepared)).toEqual({ valid: true, errors: [] });
  });

  it('rejects raw fallback output', () => {
    expect(validateFinalMarketJson({ raw: 'not json' })).toEqual({
      valid: false,
      errors: ['finalizer output must be structured JSON, not raw text'],
    });
  });
});
