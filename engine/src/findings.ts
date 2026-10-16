/**
 * Findings and check results: the coordination contract between checks,
 * agents, and the acceptance policy.
 *
 * A finding is always tied to the spec version it was raised against and to
 * a path inside that spec, so it can never silently attach to a different
 * draft. A finding closes only when a fresh check on a newer version no
 * longer produces it — never because another agent agreed it was fixed.
 */

export type Severity = 'blocker' | 'major' | 'minor';

export interface Finding {
  /** Stable across runs of the same check on the same spec. */
  findingId: string;
  specVersion: number;
  checkId: string;
  /** JSON pointer into the spec, e.g. "/predicate/bands/1". */
  path: string;
  severity: Severity;
  message: string;
  /** A concrete scenario that demonstrates the defect. */
  counterexample?: string;
  status: 'open' | 'resolved';
  origin: 'check' | 'agent';
}

/**
 * Kept distinct on purpose: an outage or a check that could not decide is
 * never the same as a pass.
 */
export type CheckStatus = 'passed' | 'failed' | 'unknown' | 'unavailable' | 'not_run';

export interface CheckResult {
  checkId: string;
  specVersion: number;
  status: CheckStatus;
  findings: Finding[];
  /** Why the status is unknown/unavailable/not_run, when it is. */
  note?: string;
}

/**
 * A judgment from a reviewer (model or human) on a check that code cannot
 * decide. Bound to an exact spec digest so it cannot carry over to an edited
 * spec.
 */
export interface Attestation {
  checkId: string;
  specVersion: number;
  specDigest: string;
  by: string;
  verdict: 'passed' | 'failed';
  rationale: string;
}

export function finding(
  specVersion: number,
  checkId: string,
  code: string,
  path: string,
  severity: Severity,
  message: string,
  counterexample?: string,
): Finding {
  return {
    findingId: `${checkId}:${code}:${path}`,
    specVersion,
    checkId,
    path,
    severity,
    message,
    ...(counterexample === undefined ? {} : { counterexample }),
    status: 'open',
    origin: 'check',
  };
}

/** A check fails when it raises any blocker; majors and minors are warnings. */
export function resultFromFindings(
  checkId: string,
  specVersion: number,
  findings: Finding[],
): CheckResult {
  const failed = findings.some((f) => f.severity === 'blocker');
  return { checkId, specVersion, status: failed ? 'failed' : 'passed', findings };
}
