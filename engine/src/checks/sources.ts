import { finding, resultFromFindings, type CheckResult, type Finding } from '../findings.js';
import type { MarketSpec, Source } from '../spec.js';

export const CHECK_ID = 'sources.resolvable';

/**
 * Structural source checks only. Whether a source is objective, and whether
 * its content actually supports the market, is decided by a source
 * investigator with retrieved content — see judgment.objective_source.
 */
export function checkSources(spec: MarketSpec): CheckResult {
  const v = spec.specVersion;
  const out: Finding[] = [];
  const add = (code: string, path: string, severity: 'blocker' | 'major' | 'minor', message: string) =>
    out.push(finding(v, CHECK_ID, code, path, severity, message));

  const byId = new Map(spec.sources.map((s) => [s.id, s]));
  if (byId.size !== spec.sources.length) {
    add('duplicate_id', '/sources', 'blocker', 'Two sources share an id.');
  }

  spec.sources.forEach((s, i) => {
    if (s.url !== undefined && !isHttpsUrl(s.url)) {
      add('bad_url', `/sources/${i}/url`, 'blocker', `"${s.url}" is not a valid https URL.`);
    }
    if (!s.extraction.trim()) {
      add('no_extraction', `/sources/${i}/extraction`, 'blocker', `Source "${s.id}" does not say how the value is read.`);
    }
    if (!spec.sourcePrecedence.includes(s.id)) {
      add('unused', `/sources/${i}`, 'minor', `Source "${s.id}" is not in the precedence list and will never be consulted.`);
    }
  });

  if (spec.sourcePrecedence.length === 0) {
    add('no_precedence', '/sourcePrecedence', 'blocker', 'No resolution source is named.');
  }

  const seen = new Set<string>();
  const consulted: Source[] = [];
  spec.sourcePrecedence.forEach((id, i) => {
    if (seen.has(id)) {
      add('duplicate_precedence', `/sourcePrecedence/${i}`, 'minor', `Source "${id}" is listed twice.`);
      return;
    }
    seen.add(id);
    const source = byId.get(id);
    if (!source) {
      add('unknown_source', `/sourcePrecedence/${i}`, 'blocker', `Source "${id}" is not defined.`);
    } else {
      consulted.push(source);
    }
  });

  const gated = consulted.filter((s) => s.access === 'gated');
  if (consulted.length > 0 && gated.length === consulted.length) {
    add('all_gated', '/sourcePrecedence', 'blocker', 'Every resolution source requires a login, key, or subscription; an anonymous oracle cannot read any of them.');
  } else if (gated.length > 0) {
    add('some_gated', '/sourcePrecedence', 'major', `Gated source(s) ${gated.map((s) => `"${s.id}"`).join(', ')} cannot be read by an anonymous oracle.`);
  }

  return resultFromFindings(CHECK_ID, v, out);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
