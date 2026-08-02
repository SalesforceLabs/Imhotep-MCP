import { describe, it, expect } from 'vitest';
import { normalizeStoryNumber, looksLikeStoryNumber } from '../src/util/storyNumber.js';

describe('looksLikeStoryNumber', () => {
  it('accepts the many loose forms', () => {
    for (const s of ['528', 'S-528', 's528', '#s528', '#S-528', 'S000528', '  528  ']) {
      expect(looksLikeStoryNumber(s)).toBe(true);
    }
  });

  it('rejects titles and Ids', () => {
    for (const s of ['Grant intake form', 'a0X5f000000AbcdEAG', 'Release 11.3', '']) {
      expect(looksLikeStoryNumber(s)).toBe(false);
    }
  });
});

describe('normalizeStoryNumber', () => {
  it('normalizes to canonical SNNNNNN (no dash)', () => {
    expect(normalizeStoryNumber('528')).toBe('S000528');
    expect(normalizeStoryNumber('S-528')).toBe('S000528');
    expect(normalizeStoryNumber('#s528')).toBe('S000528');
    expect(normalizeStoryNumber('S000528')).toBe('S000528');
  });

  it('does not truncate numbers wider than the pad width', () => {
    expect(normalizeStoryNumber('1234567')).toBe('S1234567');
  });

  it('returns null for non-story-number input', () => {
    expect(normalizeStoryNumber('Grant intake')).toBeNull();
    expect(normalizeStoryNumber('')).toBeNull();
  });
});
