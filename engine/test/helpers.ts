import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MarketSpecSchema, specDigest, type Attestation, type MarketSpec } from '../src/index.js';
import { JUDGMENT_CHECKS } from '../src/rubric.js';

/** A fresh, mutable copy of a fixture's spec. */
export function fixtureSpec(id: string): MarketSpec {
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fixtures', `${id}.json`), 'utf8'));
  return MarketSpecSchema.parse(raw.spec);
}

export function passingJudgments(spec: MarketSpec): Attestation[] {
  const digest = specDigest(spec);
  return JUDGMENT_CHECKS.map((checkId) => ({
    checkId,
    specVersion: spec.specVersion,
    specDigest: digest,
    by: 'test-reviewer',
    verdict: 'passed',
    rationale: 'ok',
  }));
}
