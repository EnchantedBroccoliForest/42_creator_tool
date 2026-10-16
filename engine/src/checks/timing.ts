import { finding, resultFromFindings, type CheckResult, type Finding } from '../findings.js';
import type { MarketSpec, Timing } from '../spec.js';

export const ORDER_CHECK_ID = 'timing.order';
export const EARLY_RESOLUTION_CHECK_ID = 'timing.early_resolution';

/** Explicit UTC only: a trailing "Z", seconds required. */
const STRICT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const FIELDS: (keyof Timing)[] = [
  'tradingStartUTC',
  'tradingCutoffUTC',
  'observationStartUTC',
  'observationEndUTC',
  'dataDeadlineUTC',
];

export function parseUtc(value: string): number | null {
  if (!STRICT_UTC.test(value)) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  // Date.parse rolls impossible dates over ("02-30" → "03-02"); reject them.
  if (new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return ms;
}

export function checkTimingOrder(spec: MarketSpec): CheckResult {
  const v = spec.specVersion;
  const out: Finding[] = [];
  const f = (code: string, path: string, message: string, counterexample?: string) =>
    out.push(finding(v, ORDER_CHECK_ID, code, path, 'blocker', message, counterexample));

  const t: Partial<Record<keyof Timing, number>> = {};
  for (const field of FIELDS) {
    const ms = parseUtc(spec.timing[field]);
    if (ms === null) {
      f('not_utc', `/timing/${field}`, `"${spec.timing[field]}" is not a valid explicit UTC timestamp (YYYY-MM-DDTHH:MM:SSZ).`);
    } else {
      t[field] = ms;
    }
  }

  const {
    tradingStartUTC: start,
    tradingCutoffUTC: cutoff,
    observationStartUTC: obsStart,
    observationEndUTC: obsEnd,
    dataDeadlineUTC: deadline,
  } = t;
  if (start !== undefined && cutoff !== undefined && start >= cutoff) {
    f('cutoff_before_start', '/timing/tradingCutoffUTC', 'Trading cutoff must be after trading start.');
  }
  if (obsStart !== undefined && obsEnd !== undefined && obsStart > obsEnd) {
    f('observation_inverted', '/timing/observationEndUTC', 'Observation window ends before it starts.');
  }
  if (cutoff !== undefined && obsEnd !== undefined && cutoff > obsEnd) {
    f(
      'trading_after_observation',
      '/timing/tradingCutoffUTC',
      'Trading continues after the observation window closes, so traders can buy the known winner.',
      `At ${spec.timing.observationEndUTC} the result is fixed but trading stays open until ${spec.timing.tradingCutoffUTC}.`,
    );
  }

  if (obsEnd !== undefined && deadline !== undefined && deadline < obsEnd) {
    f(
      'deadline_before_observation_end',
      '/timing/dataDeadlineUTC',
      'The data deadline falls before the observation window closes.',
      `At ${spec.timing.dataDeadlineUTC} the outage fallback could settle the market while values can still be observed until ${spec.timing.observationEndUTC}.`,
    );
  }

  return resultFromFindings(ORDER_CHECK_ID, v, out);
}

/**
 * Running-extreme predicates (max/min during a window) can become certain
 * before the window closes. If trading is still open when that happens,
 * late traders can buy a locked-in outcome.
 */
export function checkEarlyResolution(spec: MarketSpec): CheckResult {
  const v = spec.specVersion;
  const out: Finding[] = [];
  const p = spec.predicate;
  if (p.kind === 'numeric_threshold' && p.observation !== 'value_at_end') {
    const obsStart = parseUtc(spec.timing.observationStartUTC);
    const cutoff = parseUtc(spec.timing.tradingCutoffUTC);
    if (obsStart !== null && cutoff !== null && cutoff > obsStart) {
      const direction = p.observation === 'max_during' ? 'rises through' : 'falls through';
      out.push(finding(
        v,
        EARLY_RESOLUTION_CHECK_ID,
        'locks_before_cutoff',
        '/predicate/observation',
        'major',
        `A ${p.observation} market can be decided before trading closes.`,
        `If ${p.metric} ${direction} a band boundary after ${spec.timing.observationStartUTC}, that outcome is locked while trading is open until ${spec.timing.tradingCutoffUTC}.`,
      ));
    }
  }
  return resultFromFindings(EARLY_RESOLUTION_CHECK_ID, v, out);
}
