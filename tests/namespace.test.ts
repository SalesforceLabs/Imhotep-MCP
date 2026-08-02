import { describe, it, expect } from 'vitest';
import { nsApiName, stripNamespace, NAMESPACE } from '../src/util/namespace.js';

describe('nsApiName', () => {
  it('prefixes custom objects and fields', () => {
    expect(nsApiName('Story__c')).toBe('iab__Story__c');
    expect(nsApiName('Story_Description__c')).toBe('iab__Story_Description__c');
  });
  it('leaves standard fields untouched', () => {
    expect(nsApiName('Name')).toBe('Name');
    expect(nsApiName('Id')).toBe('Id');
    expect(nsApiName('CreatedDate')).toBe('CreatedDate');
  });
  it('is idempotent for already-prefixed names', () => {
    expect(nsApiName('iab__Story__c')).toBe('iab__Story__c');
  });
});

describe('stripNamespace', () => {
  it('removes the prefix when present', () => {
    expect(stripNamespace('iab__Story__c')).toBe('Story__c');
  });
  it('leaves unprefixed names as-is', () => {
    expect(stripNamespace('Name')).toBe('Name');
  });
});

describe('NAMESPACE', () => {
  it('is the fixed iab__ prefix', () => {
    expect(NAMESPACE).toBe('iab__');
  });
});
