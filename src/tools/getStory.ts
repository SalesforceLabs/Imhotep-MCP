/*******************************************************************************************
@Name           tools/getStory
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_get_story — open one Story by number, Id, URL, or title fragment, with
                selectable related data via `include`: bodies (the four rich-text fields, HTML→
                Markdown), children (child Stories), and tags. All three are on by default (§5.4);
                on an ambiguous/missing reference, returns candidates rather than "not found".
                Plan §5.1, §5.4, §5.5.
*******************************************************************************************/

import { z } from 'zod';
import type { Connection } from 'jsforce';
import type { ImhotepConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { htmlToMarkdown } from '../util/richtext.js';
import { selectClause, selectFields, shapeRecord, soqlEscape } from '../salesforce/query.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOne, resolveIncludes } from '../salesforce/resolve.js';
import { toImhotepError, ImhotepError } from '../salesforce/errors.js';

const AVAILABLE_INCLUDES = ['bodies', 'children', 'tags'] as const;

export const getStoryInputShape = {
  story: z
    .string()
    .min(1)
    .describe(
      'The Story to open: a Story number (e.g. "528", "S000528"), an 18/15-char ' +
        'Salesforce Id, a pasted record URL, or a Title fragment.',
    ),
  include: z
    .array(z.enum(AVAILABLE_INCLUDES))
    .optional()
    .describe(
      'Related data to pull: "bodies" (rich-text fields as Markdown), "children" (child Stories), ' +
        '"tags". Omit to use the configured defaults (all three on by default).',
    ),
  org: z
    .string()
    .optional()
    .describe('Optional Salesforce org alias/username to target (overrides configured default).'),
};

export type GetStoryInput = z.infer<z.ZodObject<typeof getStoryInputShape>>;

export interface GetStoryResult {
  story?: Record<string, unknown>;
  candidates?: Array<Record<string, unknown>>;
  note?: string | undefined;
}

export async function getStory(
  input: GetStoryInput,
  config: ImhotepConfig,
): Promise<GetStoryResult> {
  const storyObj = config.objects.story;
  if (!storyObj) throw new Error('Story object is not configured.');

  const includes = resolveIncludes(input.include, config.defaults?.getStory?.include, [
    ...AVAILABLE_INCLUDES,
  ]);

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      const resolved = await resolveOne(conn, storyObj, input.story, {
        org: input.org,
        allowStoryNumber: true,
      });
      if (!resolved.record) {
        return { candidates: resolved.candidates ?? [], note: resolved.note };
      }
      const story = resolved.record;

      // bodies: convert the four rich-text fields HTML→Markdown; when omitted, drop them so the
      // result stays skinny (they're the heaviest fields).
      const bodyFields = storyObj.richTextFields ?? [];
      if (includes.includes('bodies')) {
        for (const logical of bodyFields) {
          if (logical in story) story[logical] = htmlToMarkdown(story[logical] as string | null);
        }
      } else {
        for (const logical of bodyFields) delete story[logical];
      }

      if (includes.includes('children')) {
        story.children = await fetchChildren(conn, config, story.id as string);
      }
      if (includes.includes('tags')) {
        story.tags = await fetchTags(conn, config, story.id as string);
      }

      return { story };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Story' });
  }
}

/** Fetch child Stories (skinny — no bodies) via the Parent_Story lookup. */
async function fetchChildren(
  conn: Connection,
  config: ImhotepConfig,
  parentId: string,
): Promise<Array<Record<string, unknown>>> {
  const storyObj = config.objects.story!;
  const richText = new Set(storyObj.richTextFields ?? []);
  const fields = selectFields(storyObj).filter(
    (f) => !richText.has(f.logical) || f.logical === 'title',
  );
  const select = ['Id', ...fields.map((f) => f.api)].join(', ');
  const sobject = nsApiName(storyObj.apiName);
  const parentApi = nsApiName(storyObj.fields.parentStory ?? 'Parent_Story__c');
  const numApi = nsApiName(storyObj.fields.storyNumber ?? 'Story_Number__c');
  const soql = `SELECT ${select} FROM ${sobject} WHERE ${parentApi} = '${soqlEscape(parentId)}' ORDER BY ${numApi} ASC LIMIT 500`;
  const res = await conn.query<Record<string, unknown>>(soql);
  return res.records.map((r) => shapeRecord(r, fields));
}

/**
 * Fetch the Story's applied Tags via the Tag_Assignment junction, returning the Tag records
 * (shaped). Uses a semi-join so we return Tags directly rather than raw assignments.
 */
async function fetchTags(
  conn: Connection,
  config: ImhotepConfig,
  storyId: string,
): Promise<Array<Record<string, unknown>>> {
  const tagObj = config.objects.tag;
  const taObj = config.objects.tagAssignment;
  if (!tagObj || !taObj) return [];
  const fields = selectFields(tagObj);
  const select = selectClause(tagObj);
  const tagSobject = nsApiName(tagObj.apiName);
  const taSobject = nsApiName(taObj.apiName);
  const taStory = nsApiName(taObj.fields.story ?? 'Story__c');
  const taTag = nsApiName(taObj.fields.tag ?? 'Tag__c');
  const nameApi = tagObj.nameField ?? 'Name';
  const soql =
    `SELECT ${select} FROM ${tagSobject} WHERE Id IN ` +
    `(SELECT ${taTag} FROM ${taSobject} WHERE ${taStory} = '${soqlEscape(storyId)}') ` +
    `ORDER BY ${nameApi} ASC LIMIT 200`;
  const res = await conn.query<Record<string, unknown>>(soql);
  return res.records.map((r) => shapeRecord(r, fields));
}
