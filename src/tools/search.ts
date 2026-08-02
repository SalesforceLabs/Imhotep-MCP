/*******************************************************************************************
@Name           tools/search
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_search — free-text search across an object's Name + body fields when the
                user has no number/name to go on. Uses SOSL (`FIND {…} IN ALL FIELDS`), because
                Salesforce long-text/rich-text body fields CANNOT be filtered in a SOQL WHERE
                clause — SOSL is the supported way to search their contents. Plan §5.1.
*******************************************************************************************/

import { z } from 'zod';
import type { Connection } from 'jsforce';
import type { ImhotepConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { selectFields, shapeRecord } from '../salesforce/query.js';
import { withConnection } from '../salesforce/connection.js';
import { toImhotepError } from '../salesforce/errors.js';

export const searchInputShape = {
  query: z.string().min(1).describe('The free-text to search for.'),
  object: z
    .enum(['Story', 'Project', 'Release'])
    .default('Story')
    .describe('Which object to search (default Story).'),
  limit: z.number().int().positive().max(200).default(25).describe('Max rows (default 25).'),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type SearchInput = z.infer<z.ZodObject<typeof searchInputShape>>;

export interface SearchResult {
  object: string;
  matches: Array<Record<string, unknown>>;
}

/** Map the tool's object enum to the config object key. */
const OBJECT_KEY: Record<SearchInput['object'], string> = {
  Story: 'story',
  Project: 'project',
  Release: 'release',
};

/**
 * Escape a SOSL search term. SOSL reserves ? & | ! { } [ ] ( ) ^ ~ * : \ " ' + - and
 * whitespace; reserved chars are backslash-escaped. (Salesforce SOSL syntax.)
 */
export function soslEscape(term: string): string {
  return term.replace(/([?&|!{}[\]()^~*:\\"'+\-\s])/g, '\\$1');
}

export async function search(input: SearchInput, config: ImhotepConfig): Promise<SearchResult> {
  const objKey = OBJECT_KEY[input.object];
  const obj = config.objects[objKey];
  if (!obj) throw new Error(`${input.object} object is not configured.`);

  // Return the object's skinny fields (search results are a picker, not a full read).
  const richText = new Set(obj.richTextFields ?? []);
  const fields = selectFields(obj).filter((f) => !richText.has(f.logical) || f.logical === 'title');
  const returnCols = ['Id', ...fields.map((f) => f.api)].join(', ');
  const sobject = nsApiName(obj.apiName);

  const sosl =
    `FIND {${soslEscape(input.query)}} IN ALL FIELDS ` +
    `RETURNING ${sobject}(${returnCols} LIMIT ${input.limit})`;

  try {
    return await withConnection(input.org, config.apiVersion, async (conn: Connection) => {
      const result = (await conn.search(sosl)) as {
        searchRecords?: Array<Record<string, unknown>>;
      };
      const records = result.searchRecords ?? [];
      return { object: input.object, matches: records.map((r) => shapeRecord(r, fields)) };
    });
  } catch (err) {
    throw toImhotepError(err, { org: input.org ?? '(default)', object: input.object });
  }
}
