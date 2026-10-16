/**
 * Settlement-coverage check. For machine-checkable predicates this replaces
 * "ask three models whether the outcomes are MECE" with a proof: either the
 * outcomes partition the result space, or there is a concrete value at which
 * zero or two outcomes win.
 */
import { finding, resultFromFindings, type CheckResult, type Finding } from '../findings.js';
import type { Band, Categorical, MarketSpec, NumericThreshold } from '../spec.js';

export const CHECK_ID = 'predicate.partition';

export function checkPredicate(spec: MarketSpec): CheckResult {
  const p = spec.predicate;
  switch (p.kind) {
    case 'numeric_threshold':
      return resultFromFindings(CHECK_ID, spec.specVersion, checkBands(spec, p));
    case 'categorical':
      return resultFromFindings(CHECK_ID, spec.specVersion, checkCategorical(spec, p));
    case 'freeform':
      return {
        checkId: CHECK_ID,
        specVersion: spec.specVersion,
        status: 'unknown',
        findings: [],
        note: 'Freeform predicates cannot be proven to partition outcomes; a settlement challenger must attest.',
      };
  }
}

/** One end of an interval. `value` is ±Infinity when unbounded. */
interface End {
  value: number;
  inclusive: boolean;
}

interface Interval {
  index: number;
  outcomeId: string;
  lo: End;
  hi: End;
}

function toInterval(band: Band, index: number): Interval {
  return {
    index,
    outcomeId: band.outcomeId,
    lo: band.min ? { value: band.min.value, inclusive: band.min.inclusive } : { value: -Infinity, inclusive: false },
    hi: band.max ? { value: band.max.value, inclusive: band.max.inclusive } : { value: Infinity, inclusive: false },
  };
}

function isEmpty(iv: Interval): boolean {
  if (iv.lo.value > iv.hi.value) return true;
  if (iv.lo.value === iv.hi.value) return !(iv.lo.inclusive && iv.hi.inclusive);
  return false;
}

/**
 * A value both intervals contain, or null when they are disjoint. Prefers a
 * shared boundary, since that is where real specs usually collide.
 */
function sharedValue(p: Interval, q: Interval): { value: number; point: boolean } | null {
  const lo = p.lo.value > q.lo.value ? p.lo
    : q.lo.value > p.lo.value ? q.lo
    : { value: p.lo.value, inclusive: p.lo.inclusive && q.lo.inclusive };
  const hi = p.hi.value < q.hi.value ? p.hi
    : q.hi.value < p.hi.value ? q.hi
    : { value: p.hi.value, inclusive: p.hi.inclusive && q.hi.inclusive };
  if (lo.value > hi.value) return null;
  if (lo.value === hi.value) return lo.inclusive && hi.inclusive ? { value: lo.value, point: true } : null;
  if (lo.inclusive) return { value: lo.value, point: false };
  if (hi.inclusive) return { value: hi.value, point: false };
  if (Number.isFinite(lo.value) && Number.isFinite(hi.value)) return { value: (lo.value + hi.value) / 2, point: false };
  if (Number.isFinite(lo.value)) return { value: lo.value + 1, point: false };
  if (Number.isFinite(hi.value)) return { value: hi.value - 1, point: false };
  return { value: 0, point: false };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12)));
}

function checkBands(spec: MarketSpec, p: NumericThreshold): Finding[] {
  const v = spec.specVersion;
  const out: Finding[] = [];
  const f = (code: string, path: string, message: string, counterexample?: string, severity: 'blocker' | 'major' = 'blocker') =>
    out.push(finding(v, CHECK_ID, code, path, severity, message, counterexample));
  const name = (id: string) => spec.outcomes.find((o) => o.id === id)?.name ?? id;
  const at = (x: number) => `${p.metric} = ${fmt(x)} ${p.unit}`.trim();

  if (p.bands.length === 0) {
    f('no_bands', '/predicate/bands', 'No value bands are defined, so no outcome can win.');
    return out;
  }

  const outcomeIds = new Set(spec.outcomes.map((o) => o.id));
  const intervals: Interval[] = [];
  p.bands.forEach((band, i) => {
    const iv = toInterval(band, i);
    if (!outcomeIds.has(band.outcomeId)) {
      f('unknown_outcome', `/predicate/bands/${i}/outcomeId`, `Band ${i} maps to "${band.outcomeId}", which is not an outcome.`);
    }
    if (isEmpty(iv)) {
      f('empty_band', `/predicate/bands/${i}`, `Band ${i} (${name(band.outcomeId)}) contains no values.`);
    } else {
      intervals.push(iv);
    }
  });

  // Every non-catch-all outcome must be reachable through at least one band.
  const covered = new Set(intervals.map((iv) => iv.outcomeId));
  spec.outcomes.forEach((o, i) => {
    if (!covered.has(o.id) && !o.catchAll) {
      f('unreachable_outcome', `/outcomes/${i}`, `Outcome "${o.name}" is not mapped to any value, so it can never win.`, undefined, 'major');
    }
  });

  if (intervals.length === 0) return out;

  // Sort by lower bound; at equal bounds, an inclusive start comes first.
  intervals.sort((a, b) => a.lo.value - b.lo.value || Number(b.lo.inclusive) - Number(a.lo.inclusive));

  const first = intervals[0]!;
  if (first.lo.value !== -Infinity) {
    const x = first.lo.inclusive ? first.lo.value - 1 : first.lo.value;
    f('gap_below', `/predicate/bands/${first.index}/min`, 'Values below the lowest band match no outcome.', `At ${at(x)} no outcome wins.`);
  }

  // Overlaps: every pair of bands that map to different outcomes and share at
  // least one value. Bands for the same outcome may overlap freely.
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      const p1 = intervals[i]!;
      const p2 = intervals[j]!;
      if (p1.outcomeId === p2.outcomeId) continue;
      const x = sharedValue(p1, p2);
      if (x === null) continue;
      const exactly = x.point ? 'exactly ' : '';
      f(
        'overlap',
        `/predicate/bands/${p2.index}`,
        `Bands ${p1.index} and ${p2.index} overlap.`,
        `At ${exactly}${at(x.value)} both ${name(p1.outcomeId)} and ${name(p2.outcomeId)} win.`,
      );
    }
  }

  // Gaps: sweep left to right, tracking the furthest upper end covered so far.
  let frontier = first;
  for (let k = 1; k < intervals.length; k += 1) {
    const next = intervals[k]!;
    const a = frontier.hi;
    const b = next.lo;
    const path = `/predicate/bands/${next.index}`;
    if (a.value < b.value) {
      const x = Number.isFinite(a.value) ? (a.value + b.value) / 2 : b.value;
      f('gap', path, `No outcome covers the values between band ${frontier.index} and band ${next.index}.`, `At ${at(x)} no outcome wins.`);
    } else if (a.value === b.value && !a.inclusive && !b.inclusive) {
      f('gap', path, `Neither band ${frontier.index} nor band ${next.index} includes ${fmt(a.value)}.`, `At exactly ${at(a.value)} no outcome wins.`);
    }
    if (next.hi.value > a.value || (next.hi.value === a.value && next.hi.inclusive && !a.inclusive)) {
      frontier = next;
    }
  }

  if (frontier.hi.value !== Infinity) {
    const x = frontier.hi.inclusive ? frontier.hi.value + 1 : frontier.hi.value;
    f('gap_above', `/predicate/bands/${frontier.index}/max`, 'Values above the highest band match no outcome.', `At ${at(x)} no outcome wins.`);
  }

  return out;
}

function checkCategorical(spec: MarketSpec, p: Categorical): Finding[] {
  const v = spec.specVersion;
  const out: Finding[] = [];
  const f = (code: string, path: string, message: string, counterexample?: string, severity: 'blocker' | 'major' = 'blocker') =>
    out.push(finding(v, CHECK_ID, code, path, severity, message, counterexample));

  const outcomeIds = new Set(spec.outcomes.map((o) => o.id));
  const byMatch = new Map<string, { outcomeId: string; index: number }>();
  p.cases.forEach((c, i) => {
    if (!outcomeIds.has(c.outcomeId)) {
      f('unknown_outcome', `/predicate/cases/${i}/outcomeId`, `Case "${c.matches}" maps to "${c.outcomeId}", which is not an outcome.`);
    }
    const key = c.matches.trim().toLowerCase();
    const prior = byMatch.get(key);
    if (prior && prior.outcomeId !== c.outcomeId) {
      f('overlap', `/predicate/cases/${i}`, `"${c.matches}" maps to two outcomes.`, `If the result is "${c.matches}", both ${prior.outcomeId} and ${c.outcomeId} win.`);
    }
    if (!prior) byMatch.set(key, { outcomeId: c.outcomeId, index: i });
  });

  const mapped = new Set(p.cases.map((c) => c.outcomeId));
  spec.outcomes.forEach((o, i) => {
    if (!o.catchAll && !mapped.has(o.id)) {
      f('unreachable_outcome', `/outcomes/${i}`, `Outcome "${o.name}" has no matching result, so it can never win.`, undefined, 'major');
    }
  });

  const hasCatchAll = spec.outcomes.some((o) => o.catchAll);
  if (!p.closedSet && !hasCatchAll) {
    f(
      'no_catch_all',
      '/outcomes',
      'The result set is not closed and there is no catch-all outcome.',
      'If the result is anything not listed, no outcome wins and collateral is stranded.',
    );
  }

  return out;
}
