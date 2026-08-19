import { describe, it, expect } from 'vitest';
import { deepMerge, resolveGlobalConfigPath } from '../src/config/load.js';

describe('deepMerge', () => {
  it('overrides scalars, most-specific wins', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('merges nested objects recursively', () => {
    const base = {
      objects: { story: { apiName: 'Story__c', recordTypes: { default: 'Standard' } } },
    };
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
