/*******************************************************************************************
@Name           salesforce/bulk
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           10/24/2026
@Description    Shared helpers for the bulk Story write tools (create/update/transfer_stories).
                Strict, set-based Story resolution (number / Id / URL only — no fuzzy title
                matching inside a batch), per-item failure collection, an all-or-nothing save via
                the sObject Collections API (`allOrNone: true`, ≤200 records per call), and a
                single re-query that returns the written Stories skinny (no bodies) in input order.
*******************************************************************************************/

import type { Connection } from 'jsforce';
import type { ObjectConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { classifyRecordRef } from '../util/recordRef.js';
import { selectFields, shapeRecord, soqlEscape, type SelectField } from './query.js';
import type { SaveResult } from './write.js';

/** The sObject Collections API limit — one all-or-nothing call handles at most 200 records. */
export const MAX_BULK_ITEMS = 200;

/** One rejected item in a batch, identified by its 0-based position in the input array. */
export interface BulkFailure {
  index: number;
  /** The reference the item gave (Story / Release / parent), when the failure is about one. */
  reference?: string;
  message: string;
  /** Candidate records, when a reference matched more than one record. */
  candidates?: Array<Record<string, unknown>>;
}

/** The common result of every bulk tool: all items written, or none (with every failure). */
export interface BulkResult {
  ok: boolean;
  /** How many Stories were written (0 when ok is false — nothing is saved). */
  written: number;
  /** The written Stories, re-read and skinny (no rich-text bodies), in input order. */
  stories?: Array<Record<string, unknown>>;
  failures?: BulkFailure[];
  note: string;
}

/** Build the "nothing was written" result from a list of failures. */
export function rejectBatch(failures: BulkFailure[], total: number): BulkResult {
  const sorted = [...failures].sort((a, b) => a.index - b.index);
  return {
    ok: false,
    written: 0,
    failures: sorted,
    note:
      `Nothing was written: ${new Set(sorted.map((f) => f.index)).size} of ${total} item(s) failed. ` +
      'Fix the listed items (by index) and resend the whole batch.',
  };
}

/** Flag every item whose key appears more than once (e.g. the same Story twice in one batch). */
export function findDuplicates(keys: Array<string | undefined>, what: string): BulkFailure[] {
  const seen = new Map<string, number[]>();
  keys.forEach((k, i) => {
    if (k === undefined) return;
    seen.set(k, [...(seen.get(k) ?? []), i]);
  });
  const failures: BulkFailure[] = [];
  for (const indexes of seen.values()) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      failures.push({
        index,
        message: `The same ${what} appears more than once in this batch (items ${indexes.join(', ')}). Combine them into one item.`,
      });
    }
  }
  return failures;
}

/** Story fields returned by the bulk tools: everything except the heavy rich-text bodies. */
export function skinnyFields(obj: ObjectConfig): SelectField[] {
  const richText = new Set(obj.richTextFields ?? []);
  return selectFields(obj).filter((f) => !richText.has(f.logical));
}

/**
 * Compare Ids across 15/18-char forms. The first 15 characters are the case-sensitive Id;
 * the 18-char suffix is only a checksum, so matching on the prefix is exact.
 */
function idKey(id: string): string {
  return id.slice(0, 15);
}

/** Outcome of strict bulk Story resolution: matched records by reference, plus failures. */
export interface StrictResolution {
  /** Resolved Story (skinny shape) for each input index that matched. */
  byIndex: Map<number, Record<string, unknown>>;
  failures: BulkFailure[];
}

/**
 * Resolve a list of Story references with at most two queries (one for Ids/URLs, one for Story
 * numbers). Title fragments are refused: inside a batch a fuzzy match could silently hit the
 * wrong Story, and per-item disambiguation doesn't fit an all-or-nothing call. `label` names
 * the reference in messages (e.g. "Story", "parent Story"). Undefined entries are skipped.
 */
export async function resolveStoriesStrict(
  conn: Connection,
  storyObj: ObjectConfig,
  refs: Array<string | undefined>,
  label: string,
): Promise<StrictResolution> {
  const failures: BulkFailure[] = [];
  const ids = new Map<number, string>();
  const numbers = new Map<number, string>();

  refs.forEach((raw, index) => {
    if (raw === undefined) return;
    const ref = classifyRecordRef(raw, { allowStoryNumber: true });
    if (ref.id) ids.set(index, ref.id);
    else if (ref.storyNumber) numbers.set(index, ref.storyNumber);
    else
      failures.push({
        index,
        reference: raw,
        message: `Bulk tools need an exact ${label} reference — a Story number (e.g. S000528), Id, or record URL — not a title fragment.`,
      });
  });

  const fields = skinnyFields(storyObj);
  const select = ['Id', ...fields.map((f) => f.api)].join(', ');
  const sobject = nsApiName(storyObj.apiName);
  const numField = storyObj.storyNumberField ?? storyObj.fields.storyNumber;
  const numApi = numField ? nsApiName(numField) : undefined;

  const byId = new Map<string, Record<string, unknown>>();
  const byNumber = new Map<string, Record<string, unknown>>();

  if (ids.size > 0) {
    const list = [...new Set(ids.values())].map((v) => `'${soqlEscape(v)}'`).join(', ');
    const res = await conn.query<Record<string, unknown>>(
      `SELECT ${select} FROM ${sobject} WHERE Id IN (${list})`,
    );
    for (const row of res.records) byId.set(idKey(row.Id as string), shapeRecord(row, fields));
  }
  if (numbers.size > 0 && numApi) {
    const list = [...new Set(numbers.values())].map((v) => `'${soqlEscape(v)}'`).join(', ');
    const res = await conn.query<Record<string, unknown>>(
      `SELECT ${select} FROM ${sobject} WHERE ${numApi} IN (${list})`,
    );
    for (const row of res.records) byNumber.set(String(row[numApi]), shapeRecord(row, fields));
  }

  const byIndex = new Map<number, Record<string, unknown>>();
  for (const [index, id] of ids) {
    const rec = byId.get(idKey(id));
    if (rec) byIndex.set(index, rec);
    else
      failures.push({
        index,
        reference: refs[index]!,
        message: `No ${label} found with Id ${id}.`,
      });
  }
  for (const [index, num] of numbers) {
    const rec = byNumber.get(num);
    if (rec) byIndex.set(index, rec);
    else
      failures.push({
        index,
        reference: refs[index]!,
        message: `No ${label} found numbered ${num}.`,
      });
  }
  return { byIndex, failures };
}

/**
 * Save records all-or-nothing through the sObject Collections API. Returns the new/updated Ids
 * in input order, or the per-item failures. With `allOrNone`, Salesforce marks every record it
 * rolled back because of ANOTHER item's error as ALL_OR_NONE_OPERATION_ROLLED_BACK — those are
 * dropped so the failures list names only the items that actually need fixing.
 */
export async function saveAllOrNone(
  conn: Connection,
  obj: ObjectConfig,
  mode: 'create' | 'update',
  payloads: Array<Record<string, unknown>>,
): Promise<{ ids: string[] } | { failures: BulkFailure[] }> {
  const sobject = conn.sobject(nsApiName(obj.apiName));
  const results = (await (mode === 'create'
    ? sobject.create(payloads as never, { allOrNone: true })
    : sobject.update(payloads as never, { allOrNone: true }))) as unknown as SaveResult[];
  const failures = collectSaveFailures(results);
  if (failures.length > 0) return { failures };
  return { ids: results.map((r, i) => r.id ?? (payloads[i]!.Id as string)) };
}

/** Pull the real per-item errors out of an all-or-nothing save result (see saveAllOrNone). */
export function collectSaveFailures(results: SaveResult[]): BulkFailure[] {
  const failures: BulkFailure[] = [];
  results.forEach((r, index) => {
    if (r.success) return;
    const errors = (Array.isArray(r.errors) ? r.errors : []) as Array<{
      statusCode?: string;
      errorCode?: string;
      message?: string;
      fields?: string[];
    }>;
    const real = errors.filter(
      (e) => (e.statusCode ?? e.errorCode) !== 'ALL_OR_NONE_OPERATION_ROLLED_BACK',
    );
    if (errors.length > 0 && real.length === 0) return;
    const message =
      real
        .map((e) => {
          const code = e.statusCode ?? e.errorCode;
          const fields = e.fields?.length ? ` (field: ${e.fields.join(', ')})` : '';
          return `${code ? `${code}: ` : ''}${e.message ?? 'save failed'}${fields}`;
        })
        .join('; ') || 'Salesforce rejected this record.';
    failures.push({ index, message });
  });
  return failures;
}

/** Re-read written Stories in one query and return them skinny, in the order of `ids`. */
export async function fetchSkinnyInOrder(
  conn: Connection,
  obj: ObjectConfig,
  ids: string[],
): Promise<Array<Record<string, unknown>>> {
  const fields = skinnyFields(obj);
  const select = ['Id', ...fields.map((f) => f.api)].join(', ');
  const list = ids.map((id) => `'${soqlEscape(id)}'`).join(', ');
  const res = await conn.query<Record<string, unknown>>(
    `SELECT ${select} FROM ${nsApiName(obj.apiName)} WHERE Id IN (${list})`,
  );
  const byId = new Map(res.records.map((r) => [idKey(r.Id as string), shapeRecord(r, fields)]));
  return ids.map((id) => byId.get(idKey(id)) ?? { id, note: 'Written, but could not be re-read.' });
}
