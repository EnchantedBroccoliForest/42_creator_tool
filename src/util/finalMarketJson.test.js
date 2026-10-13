import { describe, expect, it } from 'vitest';
import { validateFinalMarketJson } from './finalMarketJson.js';

function market(outcomes, extra = {}) {
  return {
    refinedQuestion: 'Will the market cap be below $10B?',
    outcomes: outcomes.map((name) => ({ name, winCondition: `${name} wins.` })),
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

  it('requires a question and at least two named outcomes with win conditions', () => {
    const result = validateFinalMarketJson({
      refinedQuestion: ' ',
      outcomes: [{ name: 'Yes' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'refinedQuestion must be a non-empty string',
      'outcomes must be an array with at least two entries',
    ]);

    const missing = validateFinalMarketJson({
      refinedQuestion: 'Q?',
      outcomes: [{ name: 'Yes', winCondition: 'Yes wins.' }, { name: '', winCondition: 'x' }, { name: 'No' }],
    });
    expect(missing.errors).toEqual([
      'outcomes[1].name must be a non-empty string',
      'outcomes[2].winCondition must be a non-empty string',
    ]);
  });

  it('rejects duplicate outcome names', () => {
    expect(validateFinalMarketJson(market(['Yes', 'yes '])).errors).toEqual([
      'outcomes[1].name duplicates an earlier outcome',
    ]);
  });
});
