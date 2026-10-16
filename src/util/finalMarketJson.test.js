import { describe, expect, it } from 'vitest';
import { validateFinalMarketJson } from './finalMarketJson.js';

function market(outcomes, extra = {}) {
  return {
    refinedQuestion: 'Will the market cap be below $10B?',
    outcomes: outcomes.map((name) => ({
      name,
      winCondition: `${name} wins.`,
      resolutionCriteria: 'Read from the official filing.',
    })),
    marketStartTimeUTC: '2026-01-01T00:00:00Z',
    marketEndTimeUTC: '2026-12-31T23:59:59Z',
    fullResolutionRules: '1. Use the official filing.',
    edgeCases: '1. Filing delayed → Other / None',
    ...extra,
  };
}

describe('validateFinalMarketJson', () => {
  it('rejects outcome names that begin with the reserved OT token prefix', () => {
    const result = validateFinalMarketJson(
      market(['Below $10B', 'OT Below $10B', 'OT-Above $10B', 'OTBelow $10B']),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'outcomes[1].name must not begin with reserved "OT" token prefix',
      'outcomes[2].name must not begin with reserved "OT" token prefix',
      'outcomes[3].name must not begin with reserved "OT" token prefix',
    ]);
  });

  it('allows canonical catch-all and ordinary outcome names', () => {
    expect(validateFinalMarketJson(market(['Other / None', 'Below $10B'])))
      .toEqual({ valid: true, errors: [] });
  });

  it('rejects the raw fallback for unparseable finalizer output', () => {
    expect(validateFinalMarketJson({ raw: 'not json' })).toEqual({
      valid: false,
      errors: ['finalizer output was not valid JSON'],
    });
  });

  it('rejects non-object output', () => {
    expect(validateFinalMarketJson(null).valid).toBe(false);
    expect(validateFinalMarketJson([]).valid).toBe(false);
  });

  it('requires a question and at least two outcomes', () => {
    const result = validateFinalMarketJson(market(['Yes'], { refinedQuestion: ' ' }));
    expect(result.errors).toEqual([
      'refinedQuestion must be a non-empty string',
      'outcomes must be an array with at least two entries',
    ]);
  });

  it('requires each outcome to have a name, win condition, and resolution criteria', () => {
    const result = validateFinalMarketJson(market(['Yes', 'No'], {
      outcomes: [
        { name: 'Yes', winCondition: 'Yes wins.', resolutionCriteria: 'Filing.' },
        { name: '', winCondition: 'x', resolutionCriteria: 'y' },
        { name: 'No' },
      ],
    }));
    expect(result.errors).toEqual([
      'outcomes[1].name must be a non-empty string',
      'outcomes[2].winCondition must be a non-empty string',
      'outcomes[2].resolutionCriteria must be a non-empty string',
    ]);
  });

  it('requires timestamps and settlement text', () => {
    const result = validateFinalMarketJson(market(['Yes', 'No'], {
      marketStartTimeUTC: undefined,
      marketEndTimeUTC: 'soon',
      fullResolutionRules: '',
      edgeCases: [],
    }));
    expect(result.errors).toEqual([
      'marketStartTimeUTC must be a parseable timestamp',
      'marketEndTimeUTC must be a parseable timestamp',
      'fullResolutionRules must not be empty',
      'edgeCases must not be empty',
    ]);
  });

  it('accepts settlement text given as a list', () => {
    expect(validateFinalMarketJson(market(['Yes', 'No'], {
      fullResolutionRules: ['Use the official filing.'],
      edgeCases: ['Filing delayed → No'],
    })).valid).toBe(true);
  });

  it('rejects duplicate outcome names', () => {
    expect(validateFinalMarketJson(market(['Yes', 'yes '])).errors).toEqual([
      'outcomes[1].name duplicates an earlier outcome',
    ]);
  });
});
