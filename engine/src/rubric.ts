/**
 * The 42.space rigor rubric, ported from src/constants/rubric.js in the
 * legacy app, with each item mapped to how the engine now enforces it.
 *
 * `checks` are deterministic checks that decide the item (fully or for the
 * machine-checkable part). `judgment` names the check that still needs a
 * reviewer's attestation because code cannot decide it. Items with both are
 * split: code proves what it can and a reviewer covers the rest.
 */

export interface RubricItem {
  id: string;
  question: string;
  rationale: string;
  checks: string[];
  judgment?: string;
}

export const RIGOR_RUBRIC: RubricItem[] = [
  {
    id: 'mece',
    question:
      'Is the outcome set MECE — every plausible result mapped to exactly one Outcome Token, with a catch-all if the space is not provably closed?',
    rationale:
      '42 spawns one Outcome Token per outcome and settles parimutuel pro-rata to the winner. Overlapping outcomes break pro-rata math; missing outcomes permanently strand real collateral on losing tokens with no path to redistribution.',
    // Proven for numeric and categorical predicates; freeform predicates
    // leave predicate.partition "unknown" until a challenger attests.
    checks: ['outcomes.identity', 'predicate.partition'],
  },
  {
    id: 'objective_source',
    question:
      'Does the resolution map onto a clearly named, machine-readable, objectively verifiable source that an anonymous oracle can read deterministically — no API key, login, or paid subscription required?',
    rationale:
      'A source that is ambiguous, paywalled, editorial, interpretive, or self-referential turns the market into an opinion poll and breaks objective-oracle settlement.',
    checks: ['sources.resolvable'],
    judgment: 'judgment.objective_source',
  },
  {
    id: 'timing_unambiguous',
    question:
      'Are the start, parimutuel cutoff (end), and any tie-break timestamps unambiguous (explicit UTC, explicit cutoff)?',
    rationale:
      'The end timestamp is the hard parimutuel cutoff. Timezone drift and off-by-one date errors are the most common cause of disputed resolutions.',
    checks: ['timing.order', 'timing.early_resolution'],
  },
  {
    id: 'manipulation_resistant',
    question:
      'Is the market resistant to manipulation or self-resolution by interested parties (including 42 traders themselves)?',
    rationale:
      'Low-liquidity sources, resolver conflicts of interest, and self-referential outcomes create direct arbitrage incentives because traders also hold the winning collateral pool.',
    checks: [],
    judgment: 'judgment.manipulation_resistant',
  },
  {
    id: 'atomic_claims',
    question:
      'Are the claims atomic and non-compound (no "X and Y" in a single outcome win condition or rule)?',
    rationale:
      'Compound win conditions cannot be verified as a unit and hide ambiguity that breaks deterministic single-winner settlement.',
    // The typed predicate makes settlement atomic by construction; the
    // rendered win-condition prose still needs a read.
    checks: ['predicate.partition'],
    judgment: 'judgment.atomic_claims',
  },
  {
    id: 'edge_cases_covered',
    question:
      'Are edge cases explicitly enumerated, each terminating in a NAMED outcome from the outcome set?',
    rationale:
      'Every edge case must terminate in one of the spawned Outcome Tokens — there is no LP layer to absorb undefined cases.',
    checks: ['edge_cases.terminate'],
  },
];

export const JUDGMENT_CHECKS: string[] = RIGOR_RUBRIC.flatMap((r) => (r.judgment ? [r.judgment] : []));
