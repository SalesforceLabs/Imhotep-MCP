import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { readConfigFile } from '../src/config/load.js';
import type { ImhotepConfig } from '../src/config/schema.js';
import {
  collectSaveFailures,
  findDuplicates,
  rejectBatch,
  resolveStoriesStrict,
} from '../src/salesforce/bulk.js';
import { clearRecordTypeCache } from '../src/salesforce/write.js';

// a fake jsforce Connection: `query` answers by SOQL substring, `sobject().create/update` records
// every call and returns whatever the current test queued up.
interface FakeConn {
  queries: string[];
  saves: Array<{ mode: string; records: unknown[]; options: unknown }>;
  answers: Array<[string, Array<Record<string, unknown>>]>;
  saveResult: Array<Record<string, unknown>>;
  query: (soql: string) => Promise<{ records: Array<Record<string, unknown>> }>;
  sobject: (name: string) => {
    create: (r: unknown[], o: unknown) => Promise<unknown>;
    update: (r: unknown[], o: unknown) => Promise<unknown>;
  };
}

function fakeConn(): FakeConn {
  const c: FakeConn = {
    queries: [],
    saves: [],
    answers: [],
    saveResult: [],
    async query(soql) {
      c.queries.push(soql);
      const hit = c.answers.find(([needle]) => soql.includes(needle));
      return { records: hit ? hit[1] : [] };
    },
    sobject() {
      return {
        create: async (records, options) => {
          c.saves.push({ mode: 'create', records, options });
          return c.saveResult;
        },
        update: async (records, options) => {
          c.saves.push({ mode: 'update', records, options });
          return c.saveResult;
        },
      };
    },
  };
  return c;
}

let conn: FakeConn;
vi.mock('../src/salesforce/connection.js', () => ({
  withConnection: (_t: unknown, _v: unknown, op: (c: unknown) => unknown) => op(conn),
}));

const { createStories, mergeCreateDefaults } = await import('../src/tools/createStories.js');
const { updateStories } = await import('../src/tools/updateStories.js');
const { transferStories } = await import('../src/tools/transferStories.js');

const config = readConfigFile(join(__dirname, '..', 'config.default.json')) as ImhotepConfig;
const storyObj = config.objects.story!;

// 18-char Ids used across tests.
const S1 = 'a0RDo000002ZdmlMAC';
const S2 = 'a0RDo000002ZdmmMAC';
const REL = 'a0PDo00000DfZ9tMAF';
const PROJ = 'a0ODo0000008NI5MAM';

/** a raw Story row as Salesforce returns it (namespaced API names). */
function storyRow(id: string, num: string, extra: Record<string, unknown> = {}) {
  return { Id: id, iab__Story_Number__c: num, Name: `Story ${num}`, ...extra };
}

beforeEach(() => {
  conn = fakeConn();
  clearRecordTypeCache();
});

describe('collectSaveFailures', () => {
  it('reports only items with a real error, dropping all-or-none rollbacks', () => {
    const failures = collectSaveFailures([
      { success: false, errors: [{ statusCode: 'ALL_OR_NONE_OPERATION_ROLLED_BACK' }] },
      {
        success: false,
        errors: [
          { statusCode: 'FIELD_CUSTOM_VALIDATION_EXCEPTION', message: 'Nope', fields: ['Name'] },
        ],
      },
      { success: true, id: S1 },
    ]);
    expect(failures).toEqual([
      { index: 1, message: 'FIELD_CUSTOM_VALIDATION_EXCEPTION: Nope (field: Name)' },
    ]);
  });
});

describe('findDuplicates', () => {
  it('flags every index of a repeated key and ignores undefined', () => {
    const f = findDuplicates(['a', undefined, 'b', 'a'], 'Story');
    expect(f.map((x) => x.index)).toEqual([0, 3]);
    expect(f[0]!.message).toMatch(/items 0, 3/);
  });
});

describe('rejectBatch', () => {
  it('writes nothing and sorts failures by index', () => {
    const r = rejectBatch(
      [
        { index: 2, message: 'b' },
        { index: 0, message: 'a' },
        { index: 2, message: 'c' },
      ],
      5,
    );
    expect(r.ok).toBe(false);
    expect(r.written).toBe(0);
    expect(r.failures!.map((f) => f.index)).toEqual([0, 2, 2]);
    expect(r.note).toMatch(/2 of 5/);
  });
});

describe('resolveStoriesStrict', () => {
  it('refuses title fragments and resolves numbers and 15-char Ids in two queries', async () => {
    conn.answers.push(
      ['WHERE Id IN', [storyRow(S1, 'S000094')]],
      ['iab__Story_Number__c IN', [storyRow(S2, 'S000095')]],
    );
    const r = await resolveStoriesStrict(
      conn as never,
      storyObj,
      [S1.slice(0, 15), 'S95', 'intake form', undefined],
      'Story',
    );
    expect(conn.queries).toHaveLength(2);
    expect(r.byIndex.get(0)!.id).toBe(S1);
    expect(r.byIndex.get(1)!.id).toBe(S2);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatchObject({ index: 2, reference: 'intake form' });
  });

  it('reports a Story number that does not exist', async () => {
    const r = await resolveStoriesStrict(conn as never, storyObj, ['S000999'], 'parent Story');
    expect(r.failures[0]!.message).toBe('No parent Story found numbered S000999.');
  });
});

describe('mergeCreateDefaults', () => {
  it('applies item → defaults → config → shipped precedence', () => {
    const merged = mergeCreateDefaults(
      {
        stories: [{ title: 'A' }, { title: 'B', status: 'Ready', release: 'Other' }],
        defaults: { type: 'Change' },
      },
      { ...config, currentImhotepRelease: 'Current' },
    );
    expect(merged[0]).toMatchObject({ type: 'Change', status: 'Defined', releaseRef: 'Current' });
    expect(merged[1]).toMatchObject({ type: 'Change', status: 'Ready', releaseRef: 'Other' });
  });
});

describe('createStories', () => {
  beforeEach(() => {
    conn.answers.push(
      ['FROM RecordType', [{ Id: '012000000000001AAA', DeveloperName: 'Standard' }]],
      ['FROM iab__Release__c', [{ Id: REL, Name: '1.1', iab__Project__c: PROJ }]],
    );
  });

  it('creates every Story in one allOrNone call and returns them in input order', async () => {
    conn.saveResult = [
      { success: true, id: S2 },
      { success: true, id: S1 },
    ];
    conn.answers.unshift([
      'FROM iab__Story__c WHERE Id IN',
      [storyRow(S1, 'S000101'), storyRow(S2, 'S000100')],
    ]);
    const r = await createStories(
      { stories: [{ title: 'One' }, { title: 'Two' }], defaults: { release: REL } },
      config,
    );
    expect(conn.saves).toHaveLength(1);
    expect(conn.saves[0]!.options).toEqual({ allOrNone: true });
    const records = conn.saves[0]!.records as Array<Record<string, unknown>>;
    expect(records[0]).toMatchObject({
      Name: 'One',
      iab__Release__c: REL,
      iab__Project__c: PROJ,
      iab__Status__c: 'Defined',
      RecordTypeId: '012000000000001AAA',
    });
    expect(r.ok).toBe(true);
    expect(r.stories!.map((s) => s.storyNumber)).toEqual(['S000100', 'S000101']);
  });

  it('writes nothing when any item fails validation', async () => {
    const r = await createStories(
      {
        stories: [{ title: 'Fine' }, { title: 'Bad', parent_story: 'some title' }],
        defaults: { release: REL },
      },
      config,
    );
    expect(conn.saves).toHaveLength(0);
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual([expect.objectContaining({ index: 1, reference: 'some title' })]);
  });

  it('writes nothing when no Release is available', async () => {
    const r = await createStories({ stories: [{ title: 'Orphan' }] }, config);
    expect(conn.saves).toHaveLength(0);
    expect(r.failures![0]!.message).toMatch(/No Release given/);
  });

  it('returns the real Salesforce error when the all-or-none save is rolled back', async () => {
    conn.saveResult = [
      { success: false, errors: [{ statusCode: 'ALL_OR_NONE_OPERATION_ROLLED_BACK' }] },
      { success: false, errors: [{ statusCode: 'REQUIRED_FIELD_MISSING', message: 'Missing' }] },
    ];
    const r = await createStories(
      { stories: [{ title: 'One' }, { title: 'Two' }], defaults: { release: REL } },
      config,
    );
    expect(r).toMatchObject({ ok: false, written: 0 });
    expect(r.failures).toEqual([{ index: 1, message: 'REQUIRED_FIELD_MISSING: Missing' }]);
  });
});

describe('updateStories', () => {
  it('rejects an item with nothing to change, without writing', async () => {
    conn.answers.push(['WHERE Id IN', [storyRow(S1, 'S000094')]]);
    const r = await updateStories({ stories: [{ story: S1 }] }, config);
    expect(conn.saves).toHaveLength(0);
    expect(r.failures![0]!.message).toMatch(/No writable fields/);
  });

  it('rejects the same Story named twice (number and Id)', async () => {
    conn.answers.push(
      ['WHERE Id IN', [storyRow(S1, 'S000094')]],
      ['iab__Story_Number__c IN', [storyRow(S1, 'S000094')]],
    );
    const r = await updateStories(
      {
        stories: [
          { story: S1, status: 'Ready' },
          { story: 'S94', status: 'Testing' },
        ],
      },
      config,
    );
    expect(conn.saves).toHaveLength(0);
    expect(r.failures!.map((f) => f.index)).toEqual([0, 1]);
  });

  it('updates each Story by Id in one allOrNone call', async () => {
    conn.answers.push(['WHERE Id IN', [storyRow(S1, 'S000094'), storyRow(S2, 'S000095')]]);
    conn.saveResult = [
      { success: true, id: S1 },
      { success: true, id: S2 },
    ];
    const r = await updateStories(
      {
        stories: [
          { story: S1, status: 'Ready' },
          { story: S2, description: 'A **bold** note.' },
        ],
      },
      config,
    );
    expect(conn.saves[0]!.records).toEqual([
      { Id: S1, iab__Status__c: 'Ready' },
      { Id: S2, iab__Story_Description__c: '<p>A <strong>bold</strong> note.</p>' },
    ]);
    expect(r).toMatchObject({ ok: true, written: 2 });
  });
});

describe('transferStories', () => {
  it('re-points Release and Project together for every Story', async () => {
    conn.answers.push(
      ['WHERE Id IN', [storyRow(S1, 'S000094', { iab__Project__c: PROJ })]],
      ['FROM iab__Release__c', [{ Id: REL, Name: 'Backlog', iab__Project__c: PROJ }]],
    );
    conn.saveResult = [{ success: true, id: S1 }];
    const r = await transferStories({ stories: [{ story: S1 }], to_release: 'Backlog' }, config);
    expect(conn.saves[0]!.records).toEqual([
      { Id: S1, iab__Release__c: REL, iab__Project__c: PROJ },
    ]);
    expect(r.ok).toBe(true);
  });

  it('writes nothing when an item has no destination', async () => {
    conn.answers.push(['WHERE Id IN', [storyRow(S1, 'S000094')]]);
    const r = await transferStories({ stories: [{ story: S1 }] }, config);
    expect(conn.saves).toHaveLength(0);
    expect(r.failures![0]!.message).toMatch(/No destination Release/);
  });
});
