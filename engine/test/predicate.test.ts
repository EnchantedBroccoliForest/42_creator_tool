import { describe, expect, it } from 'vitest';
import { checkPredicate } from '../src/checks/predicate.js';
import type { Band } from '../src/spec.js';
import { fixtureSpec } from './helpers.js';

function withBands(bands: Band[], outcomes = ['low', 'mid', 'high']) {
  const spec = fixtureSpec('clean-numeric');
  spec.outcomes = outcomes.map((id) => ({ id, name: id, winCondition: `${id} wins` }));
  if (spec.predicate.kind !== 'numeric_threshold') throw new Error('expected numeric fixture');
  spec.predicate.bands = bands;
  return checkPredicate(spec);
}

const lt = (value: number) => ({ value, inclusive: false });
const le = (value: number) => ({ value, inclusive: true });

describe('predicate.partition (numeric)', () => {
  it('passes a three-way partition with half-open bands', () => {
    const r = withBands([
      { outcomeId: 'low', max: lt(10) },
      { outcomeId: 'mid', min: le(10), max: lt(20) },
      { outcomeId: 'high', min: le(20) },
    ]);
    expect(r.status).toBe('passed');
    expect(r.findings).toEqual([]);
  });

  it('does not report a false gap when a wide band contains a narrow one', () => {
    const r = withBands([
      { outcomeId: 'low', max: lt(0) },
      { outcomeId: 'mid', min: le(0), max: le(100) },
      { outcomeId: 'high', min: le(10), max: le(20) },
      { outcomeId: 'high', min: lt(100) },
    ]);
    const codes = r.findings.map((f) => f.findingId.split(':')[1]);
    expect(codes).toEqual(['overlap']);
    expect(r.findings[0]!.counterexample).toContain('= 10 USD both mid and high win');
  });

  it('accepts a single-point band between two open bands', () => {
    const r = withBands([
      { outcomeId: 'low', max: lt(5) },
      { outcomeId: 'mid', min: le(5), max: le(5) },
      { outcomeId: 'high', min: lt(5) },
    ]);
    expect(r.status).toBe('passed');
  });

  it('reports gaps below and above with concrete values', () => {
    const r = withBands([
      { outcomeId: 'low', min: le(0), max: lt(10) },
      { outcomeId: 'mid', min: le(10), max: lt(20) },
      { outcomeId: 'high', min: le(20), max: le(30) },
    ]);
    expect(r.status).toBe('failed');
    expect(r.findings.map((f) => f.counterexample)).toEqual([
      'At BTC-USD close = -1 USD no outcome wins.',
      'At BTC-USD close = 31 USD no outcome wins.',
    ]);
  });

  it('flags an empty band and an outcome no band reaches', () => {
    const r = withBands([
      { outcomeId: 'low', max: lt(10) },
      { outcomeId: 'mid', min: le(10), max: lt(10) },
      { outcomeId: 'low', min: le(10) },
    ]);
    const codes = r.findings.map((f) => `${f.severity}:${f.findingId.split(':')[1]}`);
    expect(codes).toContain('blocker:empty_band');
    expect(codes).toContain('major:unreachable_outcome');
  });

  it('rejects a band that maps to an unknown outcome', () => {
    const r = withBands([
      { outcomeId: 'low', max: lt(10) },
      { outcomeId: 'nope', min: le(10) },
    ], ['low']);
    expect(r.findings.some((f) => f.findingId.startsWith('predicate.partition:unknown_outcome'))).toBe(true);
  });
});

describe('predicate.partition (freeform)', () => {
  it('is unknown, never passed', () => {
    const r = checkPredicate(fixtureSpec('vague-predicate'));
    expect(r.status).toBe('unknown');
  });
});
