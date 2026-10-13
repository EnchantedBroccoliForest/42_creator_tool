import { describe, expect, it } from 'vitest';
import { resolve, type Observation } from '../src/index.js';
import { fixtureSpec } from './helpers.js';

const AFTER = '2027-07-01T12:00:00Z';
const close = (sourceId: string, value: number | string, at = '2027-06-30T23:59:00Z'): Observation => ({ sourceId, value, observedAtUTC: at });

describe('resolve (numeric threshold)', () => {
  const spec = fixtureSpec('clean-numeric');

  it('is pending until the observation window closes', () => {
    expect(resolve(spec, [close('coinbase', 120000)], '2027-06-30T12:00:00Z').status).toBe('pending');
  });

  it('settles the exact boundary on the inclusive side', () => {
    expect(resolve(spec, [close('coinbase', 100000)], AFTER)).toMatchObject({ status: 'resolved', outcomeId: 'no' });
    expect(resolve(spec, [close('coinbase', 100000.01)], AFTER)).toMatchObject({ status: 'resolved', outcomeId: 'yes' });
  });

  it('uses the latest in-window value and ignores out-of-window data', () => {
    const obs = [
      close('coinbase', 90000, '2027-06-30T01:00:00Z'),
      close('coinbase', 110000, '2027-06-30T23:00:00Z'),
      close('coinbase', 50000, '2027-07-01T01:00:00Z'),
    ];
    expect(resolve(spec, obs, AFTER)).toMatchObject({ status: 'resolved', outcomeId: 'yes', sourceId: 'coinbase' });
  });

  it('falls back to the next source in precedence order', () => {
    expect(resolve(spec, [close('kraken', 99000)], AFTER)).toMatchObject({ status: 'resolved', outcomeId: 'no', sourceId: 'kraken' });
  });

  it('applies the source_unavailable edge case when no source has data', () => {
    expect(resolve(spec, [], AFTER)).toEqual({ status: 'resolved', outcomeId: 'no', via: 'edge_case', edgeCaseId: 'no-close' });
  });

  it('refuses to pick a winner when the bands overlap', () => {
    const r = resolve(fixtureSpec('overlapping-outcomes'), [close('coinbase', 100000)], AFTER);
    expect(r).toMatchObject({ status: 'unresolved' });
  });
});

describe('resolve (categorical)', () => {
  const spec = fixtureSpec('clean-categorical');
  const at = '2026-12-30T18:00:00Z';

  it('matches a listed result case-insensitively', () => {
    expect(resolve(spec, [close('billboard', 'drake', at)], AFTER)).toMatchObject({ status: 'resolved', outcomeId: 'drake' });
  });

  it('routes an unlisted result to the catch-all', () => {
    expect(resolve(spec, [close('billboard', 'Bad Bunny', at)], AFTER)).toMatchObject({ status: 'resolved', outcomeId: 'other' });
  });
});

describe('resolve (freeform)', () => {
  it('never settles by code', () => {
    expect(resolve(fixtureSpec('vague-predicate'), [], AFTER).status).toBe('unresolved');
  });
});
