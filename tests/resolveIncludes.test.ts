import { describe, it, expect } from 'vitest';
import { resolveIncludes } from '../src/salesforce/resolve.js';

const AVAILABLE = ['bodies', 'children', 'tags'];

describe('resolveIncludes (plan §5.4 precedence)', () => {
  it('uses the per-call arg when provided (highest precedence)', () => {
    expect(resolveIncludes(['bodies'], ['children', 'tags'], AVAILABLE)).toEqual(['bodies']);
  });

  it('falls back to the config default set when no per-call arg', () => {
    expect(resolveIncludes(undefined, ['children', 'tags'], AVAILABLE)).toEqual([
      'children',
      'tags',
    ]);
  });

  it('falls back to [] when neither is set', () => {
    expect(resolveIncludes(undefined, undefined, AVAILABLE)).toEqual([]);
  });

  it('an explicit empty per-call arg wins over the config default (means "none")', () => {
    expect(resolveIncludes([], ['bodies'], AVAILABLE)).toEqual([]);
  });

  it('silently drops options the version does not ship (not in available)', () => {
    expect(resolveIncludes(['bodies', 'tests', 'files'], undefined, AVAILABLE)).toEqual(['bodies']);
  });
});
