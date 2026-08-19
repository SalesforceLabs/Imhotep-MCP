import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '../src/util/richtext.js';
import {
  buildWritePayload,
  validatePicklist,
  validateFieldLength,
} from '../src/salesforce/write.js';
import { ImhotepError } from '../src/salesforce/errors.js';
import type { ImhotepConfig, ObjectConfig } from '../src/config/schema.js';

const storyObj: ObjectConfig = {
  apiName: 'Story__c',
  nameField: 'Name',
  fields: {
    title: 'Name',
    description: 'Story_Description__c',
    status: 'Status__c',
    points: 'Points__c',
    storyNumber: 'Story_Number__c',
  },
  fieldRules: {
    title: { maxLength: 80 },
    description: { maxLength: 131072 },
  },
  richTextFields: ['description'],
  picklists: { status: ['Blocked', 'Defined', 'Building', 'Testing', 'Ready', 'Deployed'] },
};

const config: ImhotepConfig = {
  apiVersion: '62.0',
  objects: { story: storyObj },
  readOnlyFields: { story: ['storyNumber', 'points'] },
};

describe('markdownToHtml', () => {
  it('converts Markdown to HTML', () => {
    expect(markdownToHtml('A **bold** word.')).toBe('<p>A <strong>bold</strong> word.</p>');
  });
  it('returns null for null/undefined, empty string for whitespace', () => {
    expect(markdownToHtml(null)).toBeNull();
    expect(markdownToHtml(undefined)).toBeNull();
    expect(markdownToHtml('   ')).toBe('');
  });
});

describe('buildWritePayload', () => {
  it('maps logical→namespaced API and converts rich-text Markdown→HTML', () => {
    const payload = buildWritePayload(
      storyObj,
      'story',
      { title: 'My story', description: 'A **bold** note.', status: 'Ready' },
      config,
    );
    expect(payload).toEqual({
      Name: 'My story',
      iab__Story_Description__c: '<p>A <strong>bold</strong> note.</p>',
      iab__Status__c: 'Ready',
    });
  });

  it('drops undefined values (only sets provided fields)', () => {
    const payload = buildWritePayload(storyObj, 'story', { title: 'X', status: undefined }, config);
    expect(payload).toEqual({ Name: 'X' });
  });

  it('REFUSES a system-maintained (read-only) field', () => {
    expect(() => buildWritePayload(storyObj, 'story', { points: 5 }, config)).toThrow(ImhotepError);
    expect(() => buildWritePayload(storyObj, 'story', { storyNumber: 'S000001' }, config)).toThrow(
      /system-maintained/i,
    );
  });

  it('throws on an unknown field', () => {
    expect(() => buildWritePayload(storyObj, 'story', { nope: 1 }, config)).toThrow(
      /Unknown field/,
    );
  });
});

describe('validatePicklist', () => {
  it('accepts a valid value', () => {
    expect(() => validatePicklist(storyObj, 'status', 'Ready')).not.toThrow();
  });
  it('rejects an invalid value with the allowed list', () => {
    expect(() => validatePicklist(storyObj, 'status', 'Nope')).toThrow(/not a valid status/i);
  });
});

describe('validateFieldLength (sub-inc 7a)', () => {
  it('accepts a title at exactly the max (80)', () => {
    expect(() => validateFieldLength(storyObj, 'title', 'x'.repeat(80))).not.toThrow();
  });
  it('rejects a title over the max, naming the count and limit', () => {
    expect(() => validateFieldLength(storyObj, 'title', 'x'.repeat(81))).toThrow(
      /81 characters; the maximum is 80/,
    );
  });
  it('ignores fields with no rule', () => {
    expect(() => validateFieldLength(storyObj, 'status', 'x'.repeat(999))).not.toThrow();
  });
  it('ignores non-string values', () => {
    expect(() => validateFieldLength(storyObj, 'title', 12345 as unknown)).not.toThrow();
  });
  it('is enforced through buildWritePayload for every write', () => {
    expect(() => buildWritePayload(storyObj, 'story', { title: 'x'.repeat(81) }, config)).toThrow(
      /maximum is 80/,
    );
  });
});
