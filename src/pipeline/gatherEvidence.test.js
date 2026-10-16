import { describe, expect, it, vi } from 'vitest';
import { isPublicHttpUrl, resolveCitation } from './gatherEvidence.js';

describe('isPublicHttpUrl', () => {
  it.each([
    'https://www.billboard.com/charts/hot-100/',
    'http://example.com/feed',
    'https://8.8.8.8/',
    'https://[2606:4700:4700::1111]/',
  ])('allows %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(true);
  });

  it.each([
    'ftp://example.com/file',
    'file:///etc/passwd',
    'not a url',
    'http://localhost:8080/',
    'http://api.localhost/',
    'http://printer.local/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1/',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://10.0.0.5/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
  ])('blocks %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });
});

describe('resolveCitation', () => {
  it('never fetches a non-public URL', async () => {
    const fetchImpl = vi.fn();
    expect(await resolveCitation('http://169.254.169.254/latest/meta-data/', { fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats a readable 4xx as unreachable and an opaque response as reachable', async () => {
    expect(await resolveCitation('https://example.com/a', {
      fetchImpl: async () => ({ ok: false, status: 404, type: 'basic' }),
    })).toBe(false);
    expect(await resolveCitation('https://example.com/a', {
      fetchImpl: async () => ({ ok: false, status: 0, type: 'opaque' }),
    })).toBe(true);
  });
});
