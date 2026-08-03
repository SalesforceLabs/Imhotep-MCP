/*******************************************************************************************
@Name           tools/listStories
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_list_stories — the workhorse list ("what's in flight," "stories in
                release X"). Skinny (no rich-text bodies), ordered Priority_Order NULLS LAST then
                Story_Number, filters AND-combined. Plan §5.1.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { selectFields, shapeRecord, soqlEscape } from '../salesforce/query.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOne } from '../salesforce/resolve.js';
import { contextProjectRef, contextReleaseRef, resolveOneInProject } from '../salesforce/context.js';
import { toImhotepError, ImhotepError } from '../salesforce/errors.js';

export const listStoriesInputShape = {
  release: z.string().optional().describe('Filter to a Release (name, Id, or URL).'),
  project: z.string().optional().describe('Filter to a Project (name, Id, or URL).'),
  status: z
    .enum(['Blocked', 'Defined', 'Building', 'Testing', 'Ready', 'Deployed'])
    .optional()
    .describe('Filter by Story status.'),
  type: z.enum(['New', 'Change', 'Defect']).optional().describe('Filter by Story type.'),
  assigned_to: z.string().optional().describe('Filter by the Assigned Project Member Id.'),
  parent_story: z
    .string()
    .optional()
    .describe('Filter to children of this parent Story (number, Id, or URL).'),
  tag: z.string().optional().describe('Filter to Stories carrying this Tag (Tag Id).'),
  limit: z.number().int().positive().max(2000).default(50).describe('Max rows (default 50).'),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type ListStoriesInput = z.infer<z.ZodObject<typeof listStoriesInputShape>>;

export interface ListStoriesResult {
  stories?: Array<Record<string, unknown>>;
  note?: string | undefined;
}

/** Skinny Story field set: everything except the four rich-text bodies. */
function skinnyFields(storyObj: ImhotepConfig['objects'][string]) {
  const richText = new Set(storyObj.richTextFields ?? []);
  return selectFields(storyObj).filter(
    (f) => !richText.has(f.logical) || f.logical === 'title', // title is Name, always keep
  );
}

export async function listStories(
  input: ListStoriesInput,
  config: ImhotepConfig,
): Promise<ListStoriesResult> {
  const storyObj = config.objects.story;
  const releaseObj = config.objects.release;
  const projectObj = config.objects.project;
  if (!storyObj || !releaseObj || !projectObj) throw new Error('Core objects not configured.');

  const fields = skinnyFields(storyObj);
  const select = ['Id', ...fields.map((f) => f.api)].join(', ');
  const sobject = nsApiName(storyObj.apiName);
  const f = storyObj.fields;
  const priorityApi = nsApiName(f.priorityOrder ?? 'Priority_Order__c');
  const numApi = nsApiName(f.storyNumber ?? 'Story_Number__c');

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      const where: string[] = [];

      // Working context (§5.5): fall back to configured project/release when omitted.
      const projectRef = contextProjectRef(input.project, config);
      const releaseRef = contextReleaseRef(input.release, config);

      // Resolve the Project first (for filtering AND to scope release/parent name resolution).
      let projectId: string | null = null;
      if (projectRef) {
        const r = await resolveOne(conn, projectObj, projectRef, { org: input.org });
        if (!r.record) return { note: r.note ?? 'Could not resolve the Project filter.' };
        projectId = r.record.id as string;
        where.push(`${nsApiName(f.project ?? 'Project__c')} = '${soqlEscape(projectId)}'`);
      }
      if (releaseRef) {
        const r = await resolveOneInProject(conn, releaseObj, releaseRef, projectId, {
          org: input.org,
        });
        if (!r.record) return { note: r.note ?? 'Could not resolve the Release filter.' };
        where.push(`${nsApiName(f.release ?? 'Release__c')} = '${soqlEscape(r.record.id as string)}'`);
      }
      if (input.parent_story) {
        const r = await resolveOne(conn, storyObj, input.parent_story, {
          org: input.org,
          allowStoryNumber: true,
        });
        if (!r.record) return { note: r.note ?? 'Could not resolve the parent Story filter.' };
        where.push(
          `${nsApiName(f.parentStory ?? 'Parent_Story__c')} = '${soqlEscape(r.record.id as string)}'`,
        );
      }

      // Scalar / Id filters.
      if (input.status) where.push(`${nsApiName(f.status ?? 'Status__c')} = '${soqlEscape(input.status)}'`);
      if (input.type) where.push(`${nsApiName(f.type ?? 'Story_Type__c')} = '${soqlEscape(input.type)}'`);
      if (input.assigned_to)
        where.push(`${nsApiName(f.assigned ?? 'Assigned__c')} = '${soqlEscape(input.assigned_to)}'`);
      // Tag filter via the Tag_Assignments child relationship (semi-join).
      if (input.tag) {
        const ta = config.objects.tagAssignment;
        if (ta) {
          const taSobj = nsApiName(ta.apiName);
          const taStory = nsApiName(ta.fields.story ?? 'Story__c');
          const taTag = nsApiName(ta.fields.tag ?? 'Tag__c');
          where.push(
            `Id IN (SELECT ${taStory} FROM ${taSobj} WHERE ${taTag} = '${soqlEscape(input.tag)}')`,
          );
        }
      }

      const whereClause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const soql =
        `SELECT ${select} FROM ${sobject}${whereClause} ` +
        `ORDER BY ${priorityApi} ASC NULLS LAST, ${numApi} ASC LIMIT ${input.limit}`;
      const res = await conn.query<Record<string, unknown>>(soql);
      return { stories: res.records.map((r) => shapeRecord(r, fields)) };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Story' });
  }
}
