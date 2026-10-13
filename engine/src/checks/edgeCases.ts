import { finding, resultFromFindings, type CheckResult, type Finding } from '../findings.js';
import type { MarketSpec } from '../spec.js';

export const CHECK_ID = 'edge_cases.terminate';

/**
 * Edge cases every market must handle explicitly. There is no LP layer to
 * absorb an undefined case: it would strand collateral.
 */
export const REQUIRED_EDGE_CASE_KINDS = ['source_unavailable'] as const;

export function checkEdgeCases(spec: MarketSpec): CheckResult {
  const v = spec.specVersion;
  const out: Finding[] = [];
  const f = (code: string, path: string, message: string, counterexample?: string) =>
    out.push(finding(v, CHECK_ID, code, path, 'blocker', message, counterexample));

  const outcomeIds = new Set(spec.outcomes.map((o) => o.id));
  const resolutionByKind = new Map<string, string>();

  spec.edgeCases.forEach((e, i) => {
    if (!outcomeIds.has(e.resolvesTo)) {
      f('unknown_outcome', `/edgeCases/${i}/resolvesTo`, `Edge case "${e.id}" resolves to "${e.resolvesTo}", which is not an outcome.`, e.scenario);
    }
    // "other" is a bucket for distinct scenarios; every named kind must
    // have exactly one answer.
    if (e.kind === 'other') return;
    const prior = resolutionByKind.get(e.kind);
    if (prior !== undefined && prior !== e.resolvesTo) {
      f('conflicting_kind', `/edgeCases/${i}`, `Two "${e.kind}" edge cases resolve to different outcomes ("${prior}" and "${e.resolvesTo}").`, e.scenario);
    }
    resolutionByKind.set(e.kind, e.resolvesTo);
  });

  for (const kind of REQUIRED_EDGE_CASE_KINDS) {
    if (!resolutionByKind.has(kind)) {
      f('missing_required', '/edgeCases', `No "${kind}" edge case: the market has no named outcome when ${kind.replace('_', ' ')}.`);
    }
  }

  return resultFromFindings(CHECK_ID, v, out);
}
