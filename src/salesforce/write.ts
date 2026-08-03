/*******************************************************************************************
@Name           salesforce/write
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Shared write helpers for the Story/Release write tools. Turns a namespace-free
                logical field map into a Salesforce DML payload: prepends the namespace, converts
                rich-text fields Markdown→HTML, and REFUSES system-maintained (read-only/formula/
                rollup/auto-number) fields before any API call (plan §5.2). Also carries the
                autonomousMode posture (§6) and verify-after-write (§5.5).
*******************************************************************************************/

import type { Connection } from 'jsforce';
import type { ImhotepConfig, ObjectConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { markdownToHtml } from '../util/richtext.js';
import { ImhotepError } from './errors.js';
import { selectClause, selectFields, shapeRecord, soqlEscape } from './query.js';

/**
 * Build a Salesforce DML payload from a logical→value map for one object:
 *   • drops undefined values (caller passes only the fields they mean to set);
 *   • REFUSES any field in the object's read-only list (throws ImhotepError — §5.2);
 *   • converts rich-text fields Markdown→HTML;
 *   • maps logical names → namespaced API names.
 * `objectKey` is the config key (e.g. "story") used to look up the read-only list.
 */
export function buildWritePayload(
  obj: ObjectConfig,
  objectKey: string,
  values: Record<string, unknown>,
  config: ImhotepConfig,
): Record<string, unknown> {
  const readOnly = new Set(config.readOnlyFields?.[objectKey] ?? []);
  const richText = new Set(obj.richTextFields ?? []);
  const payload: Record<string, unknown> = {};

  for (const [logical, rawValue] of Object.entries(values)) {
    if (rawValue === undefined) continue;

    if (readOnly.has(logical)) {
      throw new ImhotepError(
        `The field "${logical}" on ${obj.apiName} is system-maintained (read-only) and can't be written.`,
      );
    }
    const api = obj.fields[logical];
    if (!api) {
      throw new ImhotepError(`Unknown field "${logical}" on ${obj.apiName}.`);
    }

    const value = richText.has(logical) ? markdownToHtml(rawValue as string | null) : rawValue;
    payload[nsApiName(api)] = value;
  }

  return payload;
}

/** The shape of a single-record jsforce create/update result (success + id or errors). */
export interface SaveResult {
  success: boolean;
  id?: string;
  errors?: unknown;
}

/** Cache of DeveloperName→RecordTypeId per (org, object). Populated on first need. */
const recordTypeCache = new Map<string, Map<string, string>>();

/**
 * Resolve a record-type DeveloperName (e.g. "Standard") to its RecordTypeId for the given
 * object, querying RecordType once per (org, object) and caching. Throws a clear error if the
 * name isn't found. `cacheKey` scopes the cache to the resolved org.
 */
export async function resolveRecordTypeId(
  conn: Connection,
  obj: ObjectConfig,
  developerName: string,
  cacheKey: string,
): Promise<string> {
  const key = `${cacheKey}:${obj.apiName}`;
  let byName = recordTypeCache.get(key);
  if (!byName) {
    const soql =
      `SELECT Id, DeveloperName FROM RecordType ` +
      `WHERE SObjectType = '${soqlEscape(nsApiName(obj.apiName))}'`;
    const res = await conn.query<{ Id: string; DeveloperName: string }>(soql);
    byName = new Map(res.records.map((r) => [r.DeveloperName, r.Id]));
    recordTypeCache.set(key, byName);
  }
  const id = byName.get(developerName);
  if (!id) {
    throw new ImhotepError(
      `Record type "${developerName}" not found on ${obj.apiName}. ` +
        `Available: ${[...byName.keys()].join(', ') || '(none)'}.`,
    );
  }
  return id;
}

/** Clear the record-type cache (tests / explicit re-auth). */
export function clearRecordTypeCache(): void {
  recordTypeCache.clear();
}

/** Validate a value against a configured picklist, throwing a clear error if invalid. */
export function validatePicklist(
  obj: ObjectConfig,
  logicalPicklist: string,
  value: string,
): void {
  const allowed = obj.picklists?.[logicalPicklist];
  if (allowed && !allowed.includes(value)) {
    throw new ImhotepError(
      `"${value}" is not a valid ${logicalPicklist} value for ${obj.apiName}. ` +
        `Allowed: ${allowed.join(', ')}.`,
    );
  }
}

/**
 * The autonomousMode posture (§6). Interactive confirm-before-write is the skill's job; the
 * server carries the flag so it can annotate write results and (later) gate unattended use.
 * Returns a short human-readable note describing the posture under which the write ran.
 */
export function autonomousNote(config: ImhotepConfig): string {
  return config.autonomousMode === true
    ? 'Written under autonomousMode=ON (unattended writes permitted; §6).'
    : 'Written under autonomousMode=OFF (human-confirmed-write posture; §6).';
}

/**
 * Re-query a just-written record and return its shaped state (verify-after-write, §5.5).
 * Rich-text fields are returned as stored (HTML); callers that want Markdown convert per tool.
 */
export async function verifyAfterWrite(
  conn: Connection,
  obj: ObjectConfig,
  recordId: string,
): Promise<Record<string, unknown>> {
  const fields = selectFields(obj);
  const soql = `SELECT ${selectClause(obj)} FROM ${nsApiName(obj.apiName)} WHERE Id = '${soqlEscape(
    recordId,
  )}' LIMIT 1`;
  const res = await conn.query<Record<string, unknown>>(soql);
  if (res.records.length !== 1) {
    throw new ImhotepError(`Write verification failed: could not re-read ${obj.apiName} ${recordId}.`);
  }
  return shapeRecord(res.records[0]!, fields);
}
