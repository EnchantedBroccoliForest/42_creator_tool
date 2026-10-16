import { createHash } from 'node:crypto';

/** JSON with object keys sorted at every level, so equal specs hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function specDigest(spec: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(spec)).digest('hex')}`;
}
