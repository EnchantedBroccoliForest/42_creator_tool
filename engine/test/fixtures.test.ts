/**
 * Spec-level fixtures. Each one is a market scenario (some ported from the
 * legacy eval set; see `portedFrom`) with the decision the engine must reach
 * and the checks that must fail. Reviewer judgments are supplied as
 * attestations so the deterministic part is tested in isolation.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decide, runChecks, specDigest, type Attestation } from '../src/index.js';

interface Fixture {
  id: string;
  description: string;
  portedFrom: string | null;
  spec: unknown;
  attest: string[];
  attestFail?: Record<string, string>;
  expected: {
    decision: 'accept' | 'blocked' | 'incomplete';
    failedChecks: string[];
    blockingIncludes?: string;
    missingIncludes?: string;
    warningIncludes?: string;
  };
}

const DIR = join(import.meta.dirname, '..', 'fixtures');
const fixtures: Fixture[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Fixture);

describe('spec fixtures', () => {
  it('loads the fixture set', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))('%s', (_id, fx) => {
    const { spec, results } = runChecks(fx.spec);

    const failed = results.filter((r) => r.status === 'failed').map((r) => r.checkId).sort();
    expect(failed).toEqual([...fx.expected.failedChecks].sort());

    if (!spec) {
      // Schema failures never reach the acceptance policy; everything else
      // must be reported as not_run rather than silently passing.
      expect(fx.expected.decision).toBe('blocked');
      expect(results.filter((r) => r.status === 'not_run').length).toBe(results.length - 1);
      return;
    }

    const digest = specDigest(spec);
    const attest = (checkId: string, verdict: 'passed' | 'failed', rationale: string): Attestation => ({
      checkId, specVersion: spec.specVersion, specDigest: digest, by: 'fixture-reviewer', verdict, rationale,
    });
    const attestations = [
      ...fx.attest.map((id) => attest(id, 'passed', 'Fixture attestation.')),
      ...Object.entries(fx.attestFail ?? {}).map(([id, why]) => attest(id, 'failed', why)),
    ];

    const decision = decide({ spec, results, attestations });
    expect(decision.decision).toBe(fx.expected.decision);
    if (fx.expected.blockingIncludes) {
      expect(decision.blocking.join('\n')).toContain(fx.expected.blockingIncludes);
    }
    if (fx.expected.missingIncludes) {
      expect(decision.missing.join('\n')).toContain(fx.expected.missingIncludes);
    }
    if (fx.expected.warningIncludes) {
      expect(decision.warnings.join('\n')).toContain(fx.expected.warningIncludes);
    }
  });
});
