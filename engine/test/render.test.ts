import { describe, expect, it } from 'vitest';
import { decide, freeze, renderMarketJson, runChecks } from '../src/index.js';
import { fixtureSpec, passingJudgments } from './helpers.js';

function accepted(id: string) {
  const spec = fixtureSpec(id);
  const decision = decide({ spec, results: runChecks(spec).results, attestations: passingJudgments(spec) });
  return { spec, decision };
}

describe('freeze', () => {
  it('renders an accepted spec and stamps its version and digest', () => {
    const { spec, decision } = accepted('clean-numeric');
    const frozen = freeze(spec, decision);
    expect(frozen.specVersion).toBe(1);
    expect(frozen.specDigest).toBe(decision.specDigest);
    expect(frozen.market.outcomes.map((o) => o.name)).toEqual(['Yes', 'No']);
  });

  it('refuses a spec that was not accepted', () => {
    const spec = fixtureSpec('overlapping-outcomes');
    const decision = decide({ spec, results: runChecks(spec).results, attestations: passingJudgments(spec) });
    expect(() => freeze(spec, decision)).toThrow(/decision is "blocked"/);
  });

  it('refuses a spec edited after the decision, even at the same version', () => {
    const { spec, decision } = accepted('clean-numeric');
    // The edit that a post-review "humanizer" could make.
    spec.outcomes[0]!.winCondition = 'The BTC-USD daily close for 2027-06-30 does not exceed $100,000.';
    expect(() => freeze(spec, decision)).toThrow(/different spec/);
  });
});

describe('renderMarketJson', () => {
  it('produces the legacy final-market shape with settlement text from the spec', () => {
    const m = renderMarketJson(fixtureSpec('clean-numeric'));
    expect(m.refinedQuestion).toBe('Will the BTC-USD daily close on 2027-06-30 be above $100,000?');
    expect(m.marketStartTimeUTC).toBe('2027-01-01T00:00:00Z');
    expect(m.marketEndTimeUTC).toBe('2027-06-30T00:00:00Z');
    expect(m.outcomes[0]!.resolutionCriteria).toContain('Wins if BTC-USD close is above 100000 USD as of 2027-06-30T23:59:59Z.');
    expect(m.outcomes[1]!.resolutionCriteria).toContain('Wins if BTC-USD close is at most 100000 USD');
    expect(m.fullResolutionRules).toContain('2. If the source above has no data, use Kraken XBT/USD daily OHLC');
    expect(m.fullResolutionRules).not.toContain('..');
    expect(m.edgeCases).toBe('1. Neither Coinbase nor Kraken publishes a 2027-06-30 close within 24 hours of the window closing → No');
  });

  it('describes catch-all and categorical outcomes', () => {
    const m = renderMarketJson(fixtureSpec('clean-categorical'));
    expect(m.outcomes[1]!.resolutionCriteria).toContain('Wins if the result is "Drake".');
    expect(m.outcomes[3]!.resolutionCriteria).toContain('Wins if the result matches no other outcome.');
    expect(m.edgeCases.split('\n')[1]).toBe('2. A listed artist appears only as a featured artist on the #1 song → Other / None');
  });

  it('is deterministic', () => {
    const spec = fixtureSpec('clean-categorical');
    expect(renderMarketJson(spec)).toEqual(renderMarketJson(structuredClone(spec)));
  });
});
