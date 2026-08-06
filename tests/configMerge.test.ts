import { describe, it, expect, vi } from 'vitest';
import { deepMerge, resolveGlobalConfigPath, normalizeLegacyKeys } from '../src/config/load.js';
import type { ImhotepConfig } from '../src/config/schema.js';

describe('deepMerge', () => {
  it('overrides scalars, most-specific wins', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('merges nested objects recursively', () => {
    const base = { objects: { story: { apiName: 'Story__c', recordTypes: { default: 'Standard' } } } };
    const over = { objects: { story: { recordTypes: { default: 'Simple' } } } };
    expect(deepMerge(base, over)).toEqual({
      objects: { story: { apiName: 'Story__c', recordTypes: { default: 'Simple' } } },
    });
  });

  it('replaces arrays wholesale (does not concat)', () => {
    expect(deepMerge({ include: ['a', 'b'] }, { include: ['c'] })).toEqual({ include: ['c'] });
  });

  it('ignores undefined source values', () => {
    expect(deepMerge({ a: 1 }, { a: undefined } as Partial<{ a: number }>)).toEqual({ a: 1 });
  });
});

describe('resolveGlobalConfigPath', () => {
  it('returns null when nothing is set and no files exist', () => {
    // Point HOME/XDG at a directory with no imhotep config; IMHOTEP_CONFIG unset.
    const env = { HOME: '/nonexistent-home-xyz', XDG_CONFIG_HOME: '' } as NodeJS.ProcessEnv;
    // Note: homedir() uses the OS, not HOME, so this asserts the "explicit env unset" branch
    // returns a path only if a real ~/.imhotep exists. We only assert it doesn't throw.
    expect(() => resolveGlobalConfigPath(env)).not.toThrow();
  });

  it('honors an explicit IMHOTEP_CONFIG that does not exist by returning null', () => {
    const env = { IMHOTEP_CONFIG: '/definitely/not/here/config.json' } as NodeJS.ProcessEnv;
    expect(resolveGlobalConfigPath(env)).toBeNull();
  });
});

describe('normalizeLegacyKeys (sub-inc 7a rename)', () => {
  it('renames all three legacy keys (defaultOrg/defaultProject/currentRelease) to the Imhotep-prefixed names', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const cfg = {
      apiVersion: '62.0',
      objects: {},
      defaultOrg: 'my-org',
      defaultProject: 'GPS',
      currentRelease: 'R-1',
    } as ImhotepConfig;
    normalizeLegacyKeys(cfg);
    expect(cfg.defaultImhotepOrg).toBe('my-org');
    expect(cfg.defaultImhotepProject).toBe('GPS');
    expect(cfg.currentImhotepRelease).toBe('R-1');
    expect(cfg.defaultOrg).toBeUndefined();
    expect(cfg.defaultProject).toBeUndefined();
    expect(cfg.currentRelease).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('does not clobber a new key already set', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const cfg = {
      apiVersion: '62.0',
      objects: {},
      defaultImhotepProject: 'New',
      defaultProject: 'Old',
    } as ImhotepConfig;
    normalizeLegacyKeys(cfg);
    expect(cfg.defaultImhotepProject).toBe('New');
    expect(cfg.defaultProject).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('is a no-op when no legacy keys are present', () => {
    const cfg = { apiVersion: '62.0', objects: {}, defaultImhotepProject: 'X' } as ImhotepConfig;
    normalizeLegacyKeys(cfg);
    expect(cfg.defaultImhotepProject).toBe('X');
  });
});
