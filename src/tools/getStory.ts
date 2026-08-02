/*******************************************************************************************
@Name           tools/getStory
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_get_story — open one Story by number, Id, URL, or title fragment.
                The Increment-1 proof of the end-to-end pipeline (resolve → namespaced SOQL
                → shaped result). Rich-text bodies are returned as raw HTML here; HTML→Markdown
                conversion and the include options (children/tags) arrive in Increment 2.
                Plan §5.1, §5.5.
*******************************************************************************************/

import { z } from 'zod';
import type { Connection } from 'jsforce';
import type { ImhotepConfig, ObjectConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { classifyRecordRef } from '../util/recordRef.js';
import { toImhotepError } from '../salesforce/errors.js';
import { withConnection } from '../salesforce/connection.js';

/** Zod raw shape for the tool's input (namespace-free, human-friendly). */
export const getStoryInputShape = {
  story: z
    .string()
    .min(1)
    .describe(
      'The Story to open: a Story number (e.g. "528", "S-528", "S000528"), an 18/15-char ' +
        'Salesforce Id, a pasted record URL, or a Title fragment.',
    ),
  org: z
    .string()
    .optional()
    .describe('Optional Salesforce org alias/username to target (overrides configured default).'),
};

export type GetStoryInput = z.infer<z.ZodObject<typeof getStoryInputShape>>;

/** Build the SELECT field list (namespaced) for a Story query from the config field map. */
function storySelectFields(story: ObjectConfig): { logical: string; api: string }[] {
  return Object.entries(story.fields).map(([logical, api]) => ({
    logical,
    api: nsApiName(api),
  }));
}

/** Escape a value for safe inclusion in a SOQL string literal. */
function soqlEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Shape a raw SObject row into a namespace-free, logical-keyed result object. */
function shapeStory(
  row: Record<string, unknown>,
  fields: { logical: string; api: string }[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { id: row.Id };
  for (const { logical, api } of fields) {
    out[logical] = row[api] ?? null;
  }
  return out;
}

/** The result returned to the caller. */
export interface GetStoryResult {
  /** Present when exactly one Story matched. */
  story?: Record<string, unknown>;
  /** Present (instead of `story`) when the reference was ambiguous or missed — candidates to choose from. */
  candidates?: Array<Record<string, unknown>>;
  /** Human-readable note (e.g. "no exact match; here are close candidates"). */
  note?: string;
}

/**
 * Core logic for get_story. Resolves the reference, queries the org (as the auth'd user),
 * and returns either a single story or a candidate list. Errors are translated (§6).
 */
export async function getStory(
  input: GetStoryInput,
  config: ImhotepConfig,
): Promise<GetStoryResult> {
  const story = config.objects.story;
  if (!story) throw new Error('Story object is not configured.');

  const ref = classifyRecordRef(input.story, { allowStoryNumber: true });
  const fields = storySelectFields(story);
  const selectList = ['Id', ...fields.map((f) => f.api)].join(', ');
  const sobject = nsApiName(story.apiName);
  const storyNumberApi = nsApiName(story.storyNumberField ?? 'Story_Number__c');
  const nameApi = story.nameField ?? 'Name';

  const org = input.org;
  const apiVersion = config.apiVersion;

  try {
    return await withConnection(org, apiVersion, async (conn) => {
      // 1) Direct fetch by Id (from a bare Id or a parsed URL).
      if (ref.id) {
        const soql = `SELECT ${selectList} FROM ${sobject} WHERE Id = '${soqlEscape(ref.id)}' LIMIT 1`;
        const res = await conn.query<Record<string, unknown>>(soql);
        if (res.records.length === 1) return { story: shapeStory(res.records[0]!, fields) };
        return { candidates: [], note: `No Story found with Id ${ref.id}${org ? ` in org "${org}"` : ''}.` };
      }

      // 2) Exact fetch by normalized Story number.
      if (ref.storyNumber) {
        const soql = `SELECT ${selectList} FROM ${sobject} WHERE ${storyNumberApi} = '${soqlEscape(
          ref.storyNumber,
        )}' LIMIT 1`;
        const res = await conn.query<Record<string, unknown>>(soql);
        if (res.records.length === 1) return { story: shapeStory(res.records[0]!, fields) };
        // Miss: fall through to a fuzzy probe so we return candidates, not "not found" (§5.1).
        return probeCandidates(conn, { selectList, sobject, nameApi, fragment: ref.storyNumber }, fields, org);
      }

      // 3) Title fragment → candidate search.
      return probeCandidates(conn, { selectList, sobject, nameApi, fragment: ref.fragment ?? ref.raw }, fields, org);
    });
  } catch (err) {
    throw toImhotepError(err, { org: org ?? '(default)', object: 'Story' });
  }
}

/** Fuzzy candidate probe by Name LIKE fragment. */
async function probeCandidates(
  conn: Connection,
  q: { selectList: string; sobject: string; nameApi: string; fragment: string },
  fields: { logical: string; api: string }[],
  org: string | undefined,
): Promise<GetStoryResult> {
  const like = `%${soqlEscape(q.fragment)}%`;
  const soql = `SELECT ${q.selectList} FROM ${q.sobject} WHERE ${q.nameApi} LIKE '${like}' ORDER BY ${q.nameApi} LIMIT 10`;
  const res = await conn.query<Record<string, unknown>>(soql);
  if (res.records.length === 1) return { story: shapeStory(res.records[0]!, fields) };
  return {
    candidates: res.records.map((r) => shapeStory(r, fields)),
    note:
      res.records.length === 0
        ? `No Story matched "${q.fragment}"${org ? ` in org "${org}"` : ''}.`
        : `No exact match for "${q.fragment}"; ${res.records.length} candidate(s) returned.`,
  };
}
