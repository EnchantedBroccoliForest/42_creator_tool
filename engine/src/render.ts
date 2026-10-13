/**
 * Render the creator-facing artifacts from a frozen spec. Rendering is a
 * pure function of the spec: the settlement text that ships is generated
 * from the same structure that passed the checks, never re-written by a
 * model afterwards.
 */
import type { Decision } from './acceptance.js';
import { specDigest } from './digest.js';
import type { Band, MarketSpec, Source } from './spec.js';

/** The final market JSON shape the legacy app emits (src/util/finalMarketJson.js). */
export interface MarketJson {
  refinedQuestion: string;
  outcomes: { name: string; winCondition: string; resolutionCriteria: string }[];
  marketStartTimeUTC: string;
  marketEndTimeUTC: string;
  shortDescription: string;
  fullResolutionRules: string;
  edgeCases: string;
}

export interface FrozenMarket {
  specVersion: number;
  specDigest: string;
  market: MarketJson;
}

/**
 * Freeze an accepted spec and render it. Throws unless the decision accepts
 * this exact spec (same version and digest), which is what guarantees that
 * the delivered artifact is the one that passed review.
 */
export function freeze(spec: MarketSpec, decision: Decision): FrozenMarket {
  if (decision.decision !== 'accept') {
    throw new Error(`Cannot freeze v${spec.specVersion}: decision is "${decision.decision}".`);
  }
  const digest = specDigest(spec);
  if (decision.specVersion !== spec.specVersion || decision.specDigest !== digest) {
    throw new Error(`Cannot freeze v${spec.specVersion}: the decision was made on a different spec.`);
  }
  return { specVersion: spec.specVersion, specDigest: digest, market: renderMarketJson(spec) };
}

const OBSERVATION_PHRASE = {
  value_at_end: 'as of',
  max_during: 'at its highest between',
  min_during: 'at its lowest between',
} as const;

function bandText(band: Band, metric: string, unit: string): string {
  const u = unit ? ` ${unit}` : '';
  const lo = band.min ? `${band.min.inclusive ? 'at least' : 'above'} ${band.min.value}${u}` : '';
  const hi = band.max ? `${band.max.inclusive ? 'at most' : 'below'} ${band.max.value}${u}` : '';
  return `${metric} is ${[lo, hi].filter(Boolean).join(' and ')}`;
}

function stripPeriod(text: string): string {
  return text.trim().replace(/\.+$/, '');
}

function sourceLabel(s: Source): string {
  return s.url ? `${s.description} (${s.url})` : s.description;
}

export function renderMarketJson(spec: MarketSpec): MarketJson {
  const sources = spec.sourcePrecedence
    .map((id) => spec.sources.find((s) => s.id === id))
    .filter((s): s is Source => s !== undefined);
  const primary = sources[0];
  const outcomeName = (id: string) => spec.outcomes.find((o) => o.id === id)?.name ?? id;
  const p = spec.predicate;
  const t = spec.timing;
  const window = p.kind === 'numeric_threshold' && p.observation === 'value_at_end'
    ? `${OBSERVATION_PHRASE.value_at_end} ${t.observationEndUTC}`
    : p.kind === 'numeric_threshold'
      ? `${OBSERVATION_PHRASE[p.observation]} ${t.observationStartUTC} and ${t.observationEndUTC}`
      : `between ${t.observationStartUTC} and ${t.observationEndUTC}`;

  const criteriaFor = (outcomeId: string): string => {
    const via = primary ? `Read from ${sourceLabel(primary)}: ${stripPeriod(primary.extraction)}.` : '';
    if (p.kind === 'numeric_threshold') {
      const bands = p.bands.filter((b) => b.outcomeId === outcomeId).map((b) => bandText(b, p.metric, p.unit));
      if (bands.length > 0) return `${via} Wins if ${bands.join(', or ')} ${window}.`.trim();
    }
    if (p.kind === 'categorical') {
      const cases = p.cases.filter((c) => c.outcomeId === outcomeId).map((c) => `"${c.matches}"`);
      if (cases.length > 0) return `${via} Wins if the result is ${cases.join(' or ')}.`.trim();
    }
    const outcome = spec.outcomes.find((o) => o.id === outcomeId);
    if (outcome?.catchAll) return `${via} Wins if the result matches no other outcome.`.trim();
    return via;
  };

  const rules: string[] = [];
  sources.forEach((s, i) => {
    rules.push(i === 0
      ? `Resolution source: ${sourceLabel(s)}. ${stripPeriod(s.extraction)}.`
      : `If the source above has no data, use ${sourceLabel(s)}. ${stripPeriod(s.extraction)}.`);
  });
  if (p.kind === 'numeric_threshold') rules.push(`The settling value is ${p.metric} ${window}.`);
  if (p.kind === 'freeform') rules.push(p.description);
  rules.push(`Trading opens ${t.tradingStartUTC} and closes ${t.tradingCutoffUTC}. All times are UTC.`);

  return {
    refinedQuestion: spec.question,
    outcomes: spec.outcomes.map((o) => ({
      name: o.name,
      winCondition: o.winCondition,
      resolutionCriteria: criteriaFor(o.id),
    })),
    marketStartTimeUTC: t.tradingStartUTC,
    marketEndTimeUTC: t.tradingCutoffUTC,
    shortDescription: spec.shortDescription ?? '',
    fullResolutionRules: rules.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    edgeCases: spec.edgeCases.map((e, i) => `${i + 1}. ${e.scenario} → ${outcomeName(e.resolvesTo)}`).join('\n'),
  };
}
