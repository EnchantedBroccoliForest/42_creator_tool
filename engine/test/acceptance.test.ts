import { describe, expect, it } from 'vitest';
import { decide, finding, runChecks, specDigest, type Attestation } from '../src/index.js';
import { fixtureSpec, passingJudgments } from './helpers.js';

function checked(id: string) {
  const spec = fixtureSpec(id);
  const { results } = runChecks(spec);
  return { spec, results };
}

describe('acceptance policy', () => {
  it('accepts a clean spec once judgments are attested', () => {
    const { spec, results } = checked('clean-numeric');
    const d = decide({ spec, results, attestations: passingJudgments(spec) });
    expect(d.decision).toBe('accept');
    expect(d.specDigest).toBe(specDigest(spec));
  });

  it('ignores check results from a different spec version', () => {
    const { spec, results } = checked('clean-numeric');
    const next = { ...spec, specVersion: 2 };
    const d = decide({ spec: next, results, attestations: passingJudgments(next) });
    expect(d.decision).toBe('incomplete');
    expect(d.missing).toContain('outcomes.identity: not run on v2');
  });

  it('never lets an attestation override a failed deterministic check', () => {
    const { spec, results } = checked('overlapping-outcomes');
    const digest = specDigest(spec);
    const override: Attestation = {
      checkId: 'predicate.partition', specVersion: 1, specDigest: digest, by: 'majority-vote', verdict: 'passed', rationale: '3 of 3 reviewers said MECE: yes',
    };
    const d = decide({ spec, results, attestations: [...passingJudgments(spec), override] });
    expect(d.decision).toBe('blocked');
  });

  it('ignores attestations made on an edited spec', () => {
    const { spec, results } = checked('clean-numeric');
    const stale = passingJudgments({ ...spec, question: 'A different question?' });
    const d = decide({ spec, results, attestations: stale });
    expect(d.decision).toBe('incomplete');
    expect(d.warnings.join(' ')).toMatch(/ignored/);
  });

  it('treats an unavailable check as incomplete, not passed', () => {
    const { spec, results } = checked('clean-numeric');
    const outage = results.map((r) => (r.checkId === 'sources.resolvable'
      ? { ...r, status: 'unavailable' as const, note: 'retrieval service down' }
      : r));
    const d = decide({ spec, results: outage, attestations: passingJudgments(spec) });
    expect(d.decision).toBe('incomplete');
    expect(d.missing).toContain('sources.resolvable: unavailable (retrieval service down)');
  });

  it('blocks on an agent blocker raised against this version', () => {
    const { spec, results } = checked('clean-numeric');
    const challenger = {
      ...finding(1, 'challenger', 'wrong_candle', '/sources/0/extraction', 'blocker',
        'Coinbase daily candles are labelled by open time, so "2027-06-30 candle" is ambiguous.',
        'The 2027-06-30T00:00Z candle closes at 2027-07-01T00:00Z, after the observation window.'),
      origin: 'agent' as const,
    };
    const d = decide({ spec, results, attestations: passingJudgments(spec), findings: [challenger] });
    expect(d.decision).toBe('blocked');
    expect(d.blocking.join('\n')).toContain('closes at 2027-07-01T00:00Z');
  });

  it('keeps an open finding from an earlier version until it is re-checked', () => {
    const { results } = checked('clean-numeric');
    const v2 = { ...fixtureSpec('clean-numeric'), specVersion: 2 };
    const rerun = runChecks(v2).results;
    const old = { ...finding(1, 'challenger', 'x', '/outcomes/0', 'blocker', 'old problem'), origin: 'agent' as const };
    const d = decide({ spec: v2, results: [...results, ...rerun], attestations: passingJudgments(v2), findings: [old] });
    expect(d.decision).toBe('incomplete');
    expect(d.missing.join(' ')).toContain('raised on v1; re-check against v2');

    const closed = decide({ spec: v2, results: rerun, attestations: passingJudgments(v2), findings: [{ ...old, status: 'resolved' }] });
    expect(closed.decision).toBe('accept');
  });
});
