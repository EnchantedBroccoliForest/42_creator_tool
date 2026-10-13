/**
 * MarketSpec: the single source of truth for a 42.space market.
 *
 * Every other artifact (settlement JSON, readable rules, the market card) is
 * rendered from a frozen spec version. Agents never edit prose that is later
 * re-parsed; they propose findings or patches against a spec version.
 *
 * The schema validates shape only. Semantic problems (overlapping outcomes,
 * timestamps without a timezone, edge cases that point nowhere) are reported
 * by the deterministic checks in ./checks as findings with paths and
 * counterexamples, so a malformed spec still yields actionable output.
 */
import { z } from 'zod';

const Id = z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/, 'ids are lowercase slugs');

export const OutcomeSchema = z.object({
  id: Id,
  /** Display name. Becomes the Outcome Token name, so it must be stable. */
  name: z.string(),
  /** Human-readable win condition. Rendered verbatim; never rewritten. */
  winCondition: z.string(),
  /** Catch-all outcome ("Other / None") for results outside the listed cases. */
  catchAll: z.boolean().optional(),
});

export const TimingSchema = z.object({
  /** When trading opens. */
  tradingStartUTC: z.string(),
  /** Parimutuel cutoff: trading halts here. */
  tradingCutoffUTC: z.string(),
  /** Window in which the resolving observation is taken. */
  observationStartUTC: z.string(),
  observationEndUTC: z.string(),
});

export const SourceSchema = z.object({
  id: Id,
  description: z.string(),
  url: z.string().optional(),
  /** 'gated' = requires login, API key, or subscription. */
  access: z.enum(['public', 'gated']),
  /** How the value is read from the source (field, table, page section). */
  extraction: z.string(),
});

const BoundSchema = z.object({
  value: z.number(),
  inclusive: z.boolean(),
});

export const BandSchema = z.object({
  outcomeId: Id,
  /** Omitted = unbounded below. */
  min: BoundSchema.optional(),
  /** Omitted = unbounded above. */
  max: BoundSchema.optional(),
});

export const NumericThresholdSchema = z.object({
  kind: z.literal('numeric_threshold'),
  metric: z.string(),
  unit: z.string(),
  /** Which observation in the window settles the market. */
  observation: z.enum(['value_at_end', 'max_during', 'min_during']),
  bands: z.array(BandSchema),
});

export const CategoricalSchema = z.object({
  kind: z.literal('categorical'),
  /** True only when the set of possible results is provably closed. */
  closedSet: z.boolean(),
  cases: z.array(z.object({ outcomeId: Id, matches: z.string() })),
});

export const FreeformSchema = z.object({
  kind: z.literal('freeform'),
  description: z.string(),
});

export const PredicateSchema = z.discriminatedUnion('kind', [
  NumericThresholdSchema,
  CategoricalSchema,
  FreeformSchema,
]);

export const EDGE_CASE_KINDS = [
  'source_unavailable',
  'postponed',
  'cancelled',
  'tie',
  'correction',
  'other',
] as const;

export const EdgeCaseSchema = z.object({
  id: Id,
  kind: z.enum(EDGE_CASE_KINDS),
  scenario: z.string(),
  /** Every edge case must terminate in a named outcome. */
  resolvesTo: Id,
});

export const MarketSpecSchema = z.object({
  /** Monotonic. Any change to the spec is a new version. */
  specVersion: z.number().int().positive(),
  question: z.string(),
  /** The only field an editorial pass may rewrite. Not used for settlement. */
  shortDescription: z.string().optional(),
  outcomes: z.array(OutcomeSchema),
  timing: TimingSchema,
  sources: z.array(SourceSchema),
  /** Source ids in the order they are consulted. First with data wins. */
  sourcePrecedence: z.array(Id),
  predicate: PredicateSchema,
  edgeCases: z.array(EdgeCaseSchema),
});

export type Outcome = z.infer<typeof OutcomeSchema>;
export type Timing = z.infer<typeof TimingSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Band = z.infer<typeof BandSchema>;
export type NumericThreshold = z.infer<typeof NumericThresholdSchema>;
export type Categorical = z.infer<typeof CategoricalSchema>;
export type Predicate = z.infer<typeof PredicateSchema>;
export type EdgeCase = z.infer<typeof EdgeCaseSchema>;
export type MarketSpec = z.infer<typeof MarketSpecSchema>;
