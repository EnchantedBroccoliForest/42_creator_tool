import { finding, type CheckResult } from '../findings.js';
import { JUDGMENT_CHECKS } from '../rubric.js';
import { MarketSpecSchema, type MarketSpec } from '../spec.js';
import { checkEdgeCases } from './edgeCases.js';
import { checkOutcomes } from './outcomes.js';
import { checkPredicate } from './predicate.js';
import { checkSources } from './sources.js';
import { checkEarlyResolution, checkTimingOrder } from './timing.js';

export const SCHEMA_CHECK_ID = 'spec.schema';

const DETERMINISTIC = [
  checkOutcomes,
  checkTimingOrder,
  checkEarlyResolution,
  checkSources,
  checkEdgeCases,
  checkPredicate,
] as const;

/** Every check that must have a passing result before a spec is accepted. */
export const REQUIRED_CHECKS: readonly string[] = [
  SCHEMA_CHECK_ID,
  'outcomes.identity',
  'timing.order',
  'timing.early_resolution',
  'sources.resolvable',
  'edge_cases.terminate',
  'predicate.partition',
  ...JUDGMENT_CHECKS,
];

export interface CheckRun {
  /** The parsed spec, or null when the input failed schema validation. */
  spec: MarketSpec | null;
  results: CheckResult[];
}

/**
 * Validate the input against the schema, then run every deterministic check.
 * Judgment checks are reported as "unknown" until a reviewer attests. If the
 * schema fails, the remaining checks are reported as "not_run" rather than
 * omitted, so the acceptance policy can never mistake them for passes.
 */
export function runChecks(input: unknown): CheckRun {
  const parsed = MarketSpecSchema.safeParse(input);
  const version = specVersionOf(input);

  if (!parsed.success) {
    const findings = parsed.error.issues.map((issue) => finding(
      version,
      SCHEMA_CHECK_ID,
      issue.code,
      `/${issue.path.map(String).join('/')}`,
      'blocker',
      issue.message,
    ));
    const notRun: CheckResult[] = REQUIRED_CHECKS
      .filter((id) => id !== SCHEMA_CHECK_ID)
      .map((checkId) => ({ checkId, specVersion: version, status: 'not_run', findings: [], note: 'Spec failed schema validation.' }));
    return {
      spec: null,
      results: [{ checkId: SCHEMA_CHECK_ID, specVersion: version, status: 'failed', findings }, ...notRun],
    };
  }

  const spec = parsed.data;
  const results: CheckResult[] = [
    { checkId: SCHEMA_CHECK_ID, specVersion: spec.specVersion, status: 'passed', findings: [] },
    ...DETERMINISTIC.map((check) => check(spec)),
    ...JUDGMENT_CHECKS.map((checkId): CheckResult => ({
      checkId,
      specVersion: spec.specVersion,
      status: 'unknown',
      findings: [],
      note: 'Requires a reviewer attestation.',
    })),
  ];
  return { spec, results };
}

function specVersionOf(input: unknown): number {
  const v = (input as { specVersion?: unknown } | null)?.specVersion;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0;
}
