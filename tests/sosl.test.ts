import { describe, it, expect } from 'vitest';
import { soslEscape } from '../src/tools/search.js';

describe('soslEscape', () => {
  it('escapes SOSL reserved characters', () => {
    expect(soslEscape('a?b')).toBe('a\\?b');
    expect(soslEscape('a&b|c')).toBe('a\\&b\\|c');
    expect(soslEscape('a(b)c')).toBe('a\\(b\\)c');
  });

  it('escapes whitespace (multi-word terms)', () => {
    expect(soslEscape('grant intake')).toBe('grant\\ intake');
  });

  it('leaves plain alphanumeric terms unchanged', () => {
    expect(soslEscape('story123')).toBe('story123');
  });
});
