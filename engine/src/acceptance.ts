/**
 * Acceptance policy. Agents and checks supply evidence; this code alone
 * decides whether a spec version may be frozen and rendered.
 *
 * Rules:
 *   - Every required check needs a result for this exact spec version.
 *     Results from other versions are ignored, never carried forward.
 *   - A failed deterministic check blocks. No attestation can override it:
 *     agreement never erases a demonstrated defect.
 *   - unknown / unavailable / not_run never count as a pass. They need a
 *     passing attestation bound to this spec's digest.
 *   - Any failing attestation on this digest blocks.
 *   - An open blocker finding on this version blocks. An open finding from
 *     an earlier version leaves the decision incomplete until it is
 *     re-checked against this version.
 */
import { REQUIRED_CHECKS } from './checks/index.js';
import { specDigest } from './digest.js';
import type { Attestation, CheckResult, Finding } from './findings.js';
import type { MarketSpec } from './spec.js';

export interface AcceptanceInput {
  spec: MarketSpec;
  results: CheckResult[];
  attestations?: Attestation[];
  /** Findings raised by agents (challenger, source investigator, ...). */
  findings?: Finding[];
}

export interface Decision {
  decision: 'accept' | 'blocked' | 'incomplete';
  specVersion: number;
  specDigest: string;
  /** Why the spec is blocked. */
  blocking: string[];
  /** What is still missing before a decision can be made. */
  missing: string[];
  /** Non-blocking findings to show the creator. */
  warnings: string[];
}

function describe(f: Finding): string {
  return f.counterexample ? `${f.message} Counterexample: ${f.counterexample}` : f.message;
}

export function decide(input: AcceptanceInput): Decision {
  const { spec, results } = input;
  const version = spec.specVersion;
  const digest = specDigest(spec);
  const attestations = input.attestations ?? [];
  const blocking: string[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];

  const current = (a: Attestation) => a.specVersion === version && a.specDigest === digest;

  for (const checkId of REQUIRED_CHECKS) {
    const result = results.find((r) => r.checkId === checkId && r.specVersion === version);
    const attested = attestations.filter((a) => a.checkId === checkId && current(a));
    const failedAttestations = attested.filter((a) => a.verdict === 'failed');

    for (const a of failedAttestations) {
      blocking.push(`${checkId}: ${a.by} attested a failure: ${a.rationale}`);
    }

    if (!result) {
      missing.push(`${checkId}: not run on v${version}`);
      continue;
    }

    for (const f of result.findings) {
      if (f.severity === 'blocker') blocking.push(`${checkId} ${f.path}: ${describe(f)}`);
      else warnings.push(`${checkId} ${f.path}: ${describe(f)}`);
    }

    if (result.status === 'failed') {
      // Findings above already explain it; make sure a failure without
      // findings still blocks.
      if (!result.findings.some((f) => f.severity === 'blocker')) {
        blocking.push(`${checkId}: failed${result.note ? ` (${result.note})` : ''}`);
      }
      continue;
    }
    if (result.status === 'passed') continue;

    if (failedAttestations.length === 0 && !attested.some((a) => a.verdict === 'passed')) {
      missing.push(`${checkId}: ${result.status}${result.note ? ` (${result.note})` : ''}`);
    }
  }

  const stale = attestations.filter((a) => !current(a));
  if (stale.length > 0) {
    warnings.push(`${stale.length} attestation(s) ignored: they were made on a different spec version or digest.`);
  }

  for (const f of input.findings ?? []) {
    if (f.status !== 'open') continue;
    if (f.specVersion < version) {
      missing.push(`${f.findingId}: raised on v${f.specVersion}; re-check against v${version}`);
    } else if (f.specVersion > version) {
      missing.push(`${f.findingId}: raised on v${f.specVersion}, newer than the spec being decided (v${version})`);
    } else if (f.severity === 'blocker') {
      blocking.push(`${f.findingId} ${f.path}: ${describe(f)}`);
    } else {
      warnings.push(`${f.findingId} ${f.path}: ${describe(f)}`);
    }
  }

  const decision = blocking.length > 0 ? 'blocked' : missing.length > 0 ? 'incomplete' : 'accept';
  return { decision, specVersion: version, specDigest: digest, blocking, missing, warnings };
}
