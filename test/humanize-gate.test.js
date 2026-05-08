import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');

function readSource(rel) {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('UI finalization humanizes structured output', () => {
  const APP = stripComments(readSource('src/App.jsx'));

  it('App.jsx imports and invokes humanizeFinalJson during handleAccept', () => {
    expect(APP).toMatch(/import\s*{\s*humanizeFinalJson\s*}\s*from/);
    expect(APP).toMatch(/const\s+humResult\s*=\s*await\s+humanizeFinalJson\s*\(/);
    expect(APP).toMatch(/finalContent\s*=\s*humResult\.humanizedJson/);
  });

  it('does not keep a skip path around the humanizer call', () => {
    expect(APP).not.toMatch(/Humanize skipped/);
  });
});

describe('orchestrate stays UI-free of the humanizer', () => {
  const ORCH = stripComments(readSource('src/orchestrate.js'));

  it('does not import humanizeFinalJson', () => {
    expect(ORCH).not.toMatch(/from\s+['"][^'"]*pipeline\/humanize/);
    expect(ORCH).not.toMatch(/\bhumanizeFinalJson\b/);
  });

  it('does not import the humanizer system prompt or builder', () => {
    expect(ORCH).not.toMatch(/buildHumanizerPrompt/);
    expect(ORCH).not.toMatch(/getSystemPrompt\(\s*['"]humanizer['"]/);
  });
});
