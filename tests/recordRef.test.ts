import { describe, it, expect } from 'vitest';
import { classifyRecordRef, isSalesforceId, extractIdFromUrl } from '../src/util/recordRef.js';

describe('isSalesforceId', () => {
  it('accepts 15- and 18-char ids', () => {
    expect(isSalesforceId('a0X5f000000Abcd')).toBe(true); // 15
    expect(isSalesforceId('a0X5f000000AbcdEAG')).toBe(true); // 18
  });
  it('rejects other lengths and non-alphanumerics', () => {
    expect(isSalesforceId('528')).toBe(false);
    expect(isSalesforceId('a0X5f000000Abcd!')).toBe(false);
    expect(isSalesforceId('Grant intake')).toBe(false);
  });
});

describe('extractIdFromUrl', () => {
  it('pulls the record Id from a Lightning URL', () => {
    const url =
      'https://acme.lightning.force.com/lightning/r/iab__Story__c/a0X5f000000AbcdEAG/view';
    expect(extractIdFromUrl(url)).toBe('a0X5f000000AbcdEAG');
  });
  it('pulls the Id from a Classic URL', () => {
    expect(extractIdFromUrl('https://acme.my.salesforce.com/a0X5f000000AbcdEAG')).toBe(
      'a0X5f000000AbcdEAG',
    );
  });
  it('returns null for non-URLs', () => {
    expect(extractIdFromUrl('S-528')).toBeNull();
    expect(extractIdFromUrl('a0X5f000000AbcdEAG')).toBeNull();
  });
});

describe('classifyRecordRef', () => {
  it('classifies a URL', () => {
    const ref = classifyRecordRef(
      'https://acme.lightning.force.com/lightning/r/iab__Story__c/a0X5f000000AbcdEAG/view',
    );
    expect(ref.kind).toBe('url');
    expect(ref.id).toBe('a0X5f000000AbcdEAG');
  });
  it('classifies a bare Id', () => {
    const ref = classifyRecordRef('a0X5f000000AbcdEAG');
    expect(ref.kind).toBe('id');
    expect(ref.id).toBe('a0X5f000000AbcdEAG');
  });
  it('classifies a story number', () => {
    const ref = classifyRecordRef('528');
    expect(ref.kind).toBe('storyNumber');
    expect(ref.storyNumber).toBe('S000528');
  });
  it('classifies a name fragment', () => {
    const ref = classifyRecordRef('Grant intake form');
    expect(ref.kind).toBe('name');
    expect(ref.fragment).toBe('Grant intake form');
  });
  it('treats a number as a name fragment when story numbers are disallowed', () => {
    const ref = classifyRecordRef('528', { allowStoryNumber: false });
    expect(ref.kind).toBe('name');
  });
});
