import { describe, it, expect } from 'vitest';
import { contextProjectRef, contextReleaseRef } from '../src/salesforce/context.js';
import type { ImhotepConfig } from '../src/config/schema.js';

const base: ImhotepConfig = {
  apiVersion: '62.0',
  objects: {},
  defaultProject: 'GPS Accelerators',
  currentRelease: 'R-2026.08',
};

describe('contextProjectRef (§5.5 precedence)', () => {
  it('uses the per-call value when given', () => {
    expect(contextProjectRef('Other Project', base)).toBe('Other Project');
  });
  it('falls back to configured defaultProject', () => {
    expect(contextProjectRef(undefined, base)).toBe('GPS Accelerators');
  });
  it('returns null when neither is available', () => {
    expect(contextProjectRef(undefined, { apiVersion: '62.0', objects: {} })).toBeNull();
  });
});

describe('contextReleaseRef (§5.5 precedence)', () => {
  it('uses the per-call value when given', () => {
    expect(contextReleaseRef('11.3', base)).toBe('11.3');
  });
  it('falls back to configured currentRelease', () => {
    expect(contextReleaseRef(undefined, base)).toBe('R-2026.08');
  });
  it('returns null when neither is available', () => {
    expect(contextReleaseRef(undefined, { apiVersion: '62.0', objects: {} })).toBeNull();
  });
});
