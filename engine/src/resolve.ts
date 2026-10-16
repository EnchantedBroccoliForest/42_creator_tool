/**
 * Deterministic resolver for the machine-checkable market types.
 *
 *   resolve(spec, observations, now) → resolved | pending | unresolved
 *
 * It exists so settlement behaviour can be tested directly: boundary values,
 * missing data, and fallback precedence are exercised against the same spec
 * the creator approved. Freeform markets are never resolved by code.
 */
import { parseUtc } from './checks/timing.js';
import type { MarketSpec } from './spec.js';

export interface Observation {
  sourceId: string;
  /** Numeric for numeric_threshold markets, a result label for categorical. */
  value: number | string;
  observedAtUTC: string;
}

export type Resolution =
  | { status: 'pending'; reason: string }
  | { status: 'resolved'; outcomeId: string; via: 'predicate' | 'edge_case'; edgeCaseId?: string; sourceId?: string }
  | { status: 'unresolved'; reason: string };

export function resolve(spec: MarketSpec, observations: Observation[], nowUTC: string): Resolution {
  const now = parseUtc(nowUTC);
  const start = parseUtc(spec.timing.observationStartUTC);
  const end = parseUtc(spec.timing.observationEndUTC);
  const deadline = parseUtc(spec.timing.dataDeadlineUTC);
  if (now === null || start === null || end === null || deadline === null) {
    return { status: 'unresolved', reason: 'Timestamps are not explicit UTC.' };
  }
  if (now < end) return { status: 'pending', reason: `Observation window closes ${spec.timing.observationEndUTC}.` };

  const p = spec.predicate;
  if (p.kind === 'freeform') {
    return { status: 'unresolved', reason: 'Freeform predicates are settled by the resolver, not by code.' };
  }

  const inWindow = (o: Observation) => {
    const at = parseUtc(o.observedAtUTC);
    return at !== null && at >= start && at <= end;
  };
  // Before the data deadline only the primary source can settle the market;
  // a missing value there means "not published yet", not "unavailable".
  // After the deadline, the first source in precedence order with data wins.
  const beforeDeadline = now < deadline;
  const candidates = beforeDeadline ? spec.sourcePrecedence.slice(0, 1) : spec.sourcePrecedence;
  let sourceId: string | undefined;
  let usable: Observation[] = [];
  for (const id of candidates) {
    usable = observations.filter((o) => o.sourceId === id && inWindow(o));
    if (usable.length > 0) {
      sourceId = id;
      break;
    }
  }

  if (sourceId === undefined) {
    if (beforeDeadline) {
      return { status: 'pending', reason: `Waiting for "${spec.sourcePrecedence[0]}" until ${spec.timing.dataDeadlineUTC}.` };
    }
    const fallback = spec.edgeCases.find((e) => e.kind === 'source_unavailable');
    if (!fallback) return { status: 'unresolved', reason: 'No source has data and there is no source_unavailable edge case.' };
    return { status: 'resolved', outcomeId: fallback.resolvesTo, via: 'edge_case', edgeCaseId: fallback.id };
  }

  if (p.kind === 'numeric_threshold') {
    const numeric = usable.filter((o): o is Observation & { value: number } => typeof o.value === 'number' && Number.isFinite(o.value));
    if (numeric.length === 0) return { status: 'unresolved', reason: `Source "${sourceId}" returned no numeric value.` };
    let value: number;
    if (p.observation === 'max_during') value = Math.max(...numeric.map((o) => o.value));
    else if (p.observation === 'min_during') value = Math.min(...numeric.map((o) => o.value));
    else value = numeric.reduce((a, b) => (parseUtc(b.observedAtUTC)! >= parseUtc(a.observedAtUTC)! ? b : a)).value;

    const winners = [...new Set(p.bands.filter((b) => inBand(value, b.min, b.max)).map((b) => b.outcomeId))];
    if (winners.length !== 1) {
      return { status: 'unresolved', reason: `${winners.length} outcomes match ${value}; the bands do not partition the value space.` };
    }
    return { status: 'resolved', outcomeId: winners[0]!, via: 'predicate', sourceId };
  }

  // Categorical: the latest in-window observation is the result.
  const latest = usable.reduce((a, b) => (parseUtc(b.observedAtUTC)! >= parseUtc(a.observedAtUTC)! ? b : a));
  const label = String(latest.value).trim().toLowerCase();
  const matches = [...new Set(p.cases.filter((c) => c.matches.trim().toLowerCase() === label).map((c) => c.outcomeId))];
  if (matches.length > 1) return { status: 'unresolved', reason: `"${latest.value}" matches ${matches.length} outcomes.` };
  if (matches.length === 1) return { status: 'resolved', outcomeId: matches[0]!, via: 'predicate', sourceId };
  const catchAll = spec.outcomes.find((o) => o.catchAll);
  if (catchAll) return { status: 'resolved', outcomeId: catchAll.id, via: 'predicate', sourceId };
  return { status: 'unresolved', reason: `"${latest.value}" matches no outcome and there is no catch-all.` };
}

function inBand(
  value: number,
  min: { value: number; inclusive: boolean } | undefined,
  max: { value: number; inclusive: boolean } | undefined,
): boolean {
  if (min && (min.inclusive ? value < min.value : value <= min.value)) return false;
  if (max && (max.inclusive ? value > max.value : value >= max.value)) return false;
  return true;
}
