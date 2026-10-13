import { finding, resultFromFindings, type CheckResult, type Finding } from '../findings.js';
import type { MarketSpec } from '../spec.js';

export const CHECK_ID = 'outcomes.identity';

/** Outcome Token names may not start with the reserved "OT" prefix. */
const RESERVED_PREFIX = /^OT/;

export function checkOutcomes(spec: MarketSpec): CheckResult {
  const v = spec.specVersion;
  const out: Finding[] = [];
  const f = (code: string, path: string, message: string, counterexample?: string) =>
    out.push(finding(v, CHECK_ID, code, path, 'blocker', message, counterexample));

  if (spec.outcomes.length < 2) {
    f('too_few', '/outcomes', 'A market needs at least two outcomes.');
  }

  const ids = new Map<string, number>();
  const names = new Map<string, number>();
  let catchAlls = 0;
  spec.outcomes.forEach((o, i) => {
    const path = `/outcomes/${i}`;
    if (ids.has(o.id)) f('duplicate_id', `${path}/id`, `Outcome id "${o.id}" is used twice.`);
    ids.set(o.id, i);

    const name = o.name.trim();
    if (!name) f('empty_name', `${path}/name`, 'Outcome name is empty.');
    const key = name.toLowerCase();
    const prior = names.get(key);
    if (name && prior !== undefined) {
      f('duplicate_name', `${path}/name`, `Outcome name "${name}" duplicates outcomes[${prior}].`);
    }
    names.set(key, i);
    if (RESERVED_PREFIX.test(name)) {
      f('reserved_prefix', `${path}/name`, `Outcome name "${name}" begins with the reserved "OT" token prefix.`);
    }
    if (!o.winCondition.trim()) f('empty_win_condition', `${path}/winCondition`, 'Win condition is empty.');
    if (o.catchAll) catchAlls += 1;
  });

  if (catchAlls > 1) {
    f('multiple_catch_all', '/outcomes', 'More than one outcome is marked catch-all; results outside the listed cases would match both.');
  }

  return resultFromFindings(CHECK_ID, v, out);
}
