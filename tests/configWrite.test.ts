import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import { setConfigKey, writeNewConfigFile } from '../src/config/write.js';
import { starterConfig } from '../src/config/scaffold.js';

const tmpDirs: string[] = [];
function tmpFile(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'imhotep-cfg-'));
  tmpDirs.push(dir);
  return join(dir, name);
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('setConfigKey', () => {
  it('creates a file and sets a key when none exists', () => {
    const p = tmpFile('config.json');
    setConfigKey(p, ['defaultImhotepOrg'], 'acme-prod');
    expect(parse(readFileSync(p, 'utf8'))).toEqual({ defaultImhotepOrg: 'acme-prod' });
  });

  it('PRESERVES comments when editing an existing commented file', () => {
    const p = tmpFile('config.json');
    writeNewConfigFile(p, starterConfig('global'));
    setConfigKey(p, ['defaultImhotepOrg'], 'acme-prod');
    const text = readFileSync(p, 'utf8');
    // The documented comments survive the edit...
    expect(text).toContain('Laying the foundation stones');
    expect(text).toContain('// The org where Imhotep is installed');
    // ...and the value is set and parseable.
    expect(parse(text).defaultImhotepOrg).toBe('acme-prod');
  });

  it('updates an existing value in place', () => {
    const p = tmpFile('config.json');
    setConfigKey(p, ['defaultImhotepOrg'], 'first');
    setConfigKey(p, ['defaultImhotepOrg'], 'second');
    expect(parse(readFileSync(p, 'utf8')).defaultImhotepOrg).toBe('second');
  });

  it('writes a nested key path', () => {
    const p = tmpFile('config.json');
    setConfigKey(p, ['defaults', 'getStory', 'include'], ['bodies']);
    expect(parse(readFileSync(p, 'utf8'))).toEqual({
      defaults: { getStory: { include: ['bodies'] } },
    });
  });
});

describe('writeNewConfigFile (no-clobber)', () => {
  it('writes when absent, refuses when present', () => {
    const p = tmpFile('config.json');
    expect(writeNewConfigFile(p, '{"a":1}\n')).toBe(true);
    expect(writeNewConfigFile(p, '{"a":2}\n')).toBe(false); // no-clobber
    expect(parse(readFileSync(p, 'utf8'))).toEqual({ a: 1 });
  });
});

describe('starterConfig', () => {
  it('is valid JSONC that parses to an empty override object', () => {
    for (const scope of ['global', 'project'] as const) {
      const text = starterConfig(scope);
      const errors: unknown[] = [];
      const parsed = parse(text, errors as never);
      expect(errors).toHaveLength(0);
      expect(parsed).toEqual({}); // everything is commented out
    }
  });

  it('labels the scope it was generated for', () => {
    expect(starterConfig('global')).toContain('GLOBAL config');
    expect(starterConfig('project')).toContain('PROJECT config');
  });
});
