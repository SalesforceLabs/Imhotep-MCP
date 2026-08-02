/*******************************************************************************************
@Name           salesforce/resolve
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    The RESOLUTION half of the record-reference mechanism (plan §5.5). The classifier
                (util/recordRef) decides what KIND of reference the user gave; this resolves it to
                an actual record against the org — to exactly one record for get_* tools (with
                candidates on an ambiguous miss), or short-circuiting when handed an Id/URL.
                Shared by every record-taking tool so the behavior is identical everywhere.
*******************************************************************************************/

import type { Connection } from 'jsforce';
import type { ObjectConfig } from '../config/schema.js';
import { classifyRecordRef } from '../util/recordRef.js';
import { nsApiName } from '../util/namespace.js';
import { selectClause, selectFields, shapeRecord, soqlEscape } from './query.js';

/** Outcome of resolving a reference for a get_* tool. */
export interface ResolveResult {
  /** The single matched record (shaped), when exactly one matched. */
  record?: Record<string, unknown>;
  /** Candidate records (shaped), when the reference was ambiguous or missed. */
  candidates?: Array<Record<string, unknown>>;
  /** Human-readable note for a miss / ambiguity. */
  note?: string;
}

/**
 * Resolve a record-identifying argument to a single record of the given object.
 * - Id / URL → direct fetch by Id.
 * - Story number (Story object only) → exact fetch, then fuzzy fallback probe on a miss.
 * - Name fragment → fuzzy Name LIKE probe (exactly one match returns as the record).
 * Returns candidates rather than throwing on a miss (§5.1/§5.5).
 */
export async function resolveOne(
  conn: Connection,
  obj: ObjectConfig,
  input: string,
  opts: { org?: string | undefined; allowStoryNumber?: boolean } = {},
): Promise<ResolveResult> {
  const ref = classifyRecordRef(input, { allowStoryNumber: opts.allowStoryNumber ?? false });
  const fields = selectFields(obj);
  const select = selectClause(obj);
  const sobject = nsApiName(obj.apiName);
  const nameApi = obj.nameField ?? 'Name';
  const orgSuffix = opts.org ? ` in org "${opts.org}"` : '';

  // 1) Direct fetch by Id (bare Id or parsed from a URL).
  if (ref.id) {
    const soql = `SELECT ${select} FROM ${sobject} WHERE Id = '${soqlEscape(ref.id)}' LIMIT 1`;
    const res = await conn.query<Record<string, unknown>>(soql);
    if (res.records.length === 1) return { record: shapeRecord(res.records[0]!, fields) };
    return { candidates: [], note: `No ${obj.apiName} found with Id ${ref.id}${orgSuffix}.` };
  }

  // 2) Exact fetch by normalized Story number (Story only).
  if (ref.storyNumber && obj.storyNumberField) {
    const numApi = nsApiName(obj.storyNumberField);
    const soql = `SELECT ${select} FROM ${sobject} WHERE ${numApi} = '${soqlEscape(ref.storyNumber)}' LIMIT 1`;
    const res = await conn.query<Record<string, unknown>>(soql);
    if (res.records.length === 1) return { record: shapeRecord(res.records[0]!, fields) };
    return probe(conn, { select, sobject, nameApi }, fields, ref.storyNumber, orgSuffix);
  }

  // 3) Name fragment → fuzzy probe.
  return probe(conn, { select, sobject, nameApi }, fields, ref.fragment ?? ref.raw, orgSuffix);
}

/** Fuzzy candidate probe by Name LIKE fragment (shared by resolveOne and name-search tools). */
async function probe(
  conn: Connection,
  q: { select: string; sobject: string; nameApi: string },
  fields: ReturnType<typeof selectFields>,
  fragment: string,
  orgSuffix: string,
): Promise<ResolveResult> {
  const like = `%${soqlEscape(fragment)}%`;
  const soql = `SELECT ${q.select} FROM ${q.sobject} WHERE ${q.nameApi} LIKE '${like}' ORDER BY ${q.nameApi} LIMIT 10`;
  const res = await conn.query<Record<string, unknown>>(soql);
  if (res.records.length === 1) return { record: shapeRecord(res.records[0]!, fields) };
  return {
    candidates: res.records.map((r) => shapeRecord(r, fields)),
    note:
      res.records.length === 0
        ? `No ${q.sobject} matched "${fragment}"${orgSuffix}.`
        : `No exact match for "${fragment}"; ${res.records.length} candidate(s) returned.`,
  };
}

/**
 * Resolve which `include` options to fetch for a get_* tool, per §5.4 precedence:
 *   per-call `include` arg → customer config default set → shipped default.
 * Silently drops any requested option not in `available` (a capability the version doesn't
 * ship), rather than erroring (§5.4 / §7.4).
 */
export function resolveIncludes(
  perCall: string[] | undefined,
  configDefault: string[] | undefined,
  available: string[],
): string[] {
  const requested = perCall ?? configDefault ?? [];
  const availableSet = new Set(available);
  return requested.filter((opt) => availableSet.has(opt));
}
