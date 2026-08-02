import { describe, it, expect } from 'vitest';
import { selectFields, selectClause, soqlEscape, shapeRecord } from '../src/salesforce/query.js';
import type { ObjectConfig } from '../src/config/schema.js';

const storyObj: ObjectConfig = {
  apiName: 'Story__c',
  nameField: 'Name',
  fields: {
    title: 'Name',
    status: 'Status__c',
    release: 'Release__c',
  },
};

describe('selectFields / selectClause', () => {
  it('maps logical→namespaced API and prefixes only custom fields', () => {
    const fields = selectFields(storyObj);
    expect(fields).toEqual([
      { logical: 'title', api: 'Name' },
      { logical: 'status', api: 'iab__Status__c' },
      { logical: 'release', api: 'iab__Release__c' },
    ]);
  });

  it('selectClause puts Id first, then namespaced fields', () => {
    expect(selectClause(storyObj)).toBe('Id, Name, iab__Status__c, iab__Release__c');
  });
});

describe('soqlEscape', () => {
  it("escapes single quotes and backslashes", () => {
    expect(soqlEscape("O'Brien")).toBe("O\\'Brien");
    expect(soqlEscape('a\\b')).toBe('a\\\\b');
  });
});

describe('shapeRecord', () => {
  it('produces a namespace-free, logical-keyed object with id first', () => {
    const row = { Id: 'a0X1', Name: 'My story', iab__Status__c: 'Defined', iab__Release__c: null };
    expect(shapeRecord(row, selectFields(storyObj))).toEqual({
      id: 'a0X1',
      title: 'My story',
      status: 'Defined',
      release: null,
    });
  });

  it('defaults absent mapped fields to null', () => {
    expect(shapeRecord({ Id: 'a0X2', Name: 'X' }, selectFields(storyObj))).toEqual({
      id: 'a0X2',
      title: 'X',
      status: null,
      release: null,
    });
  });
});
