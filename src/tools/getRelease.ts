/*******************************************************************************************
@Name           tools/getRelease
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_get_release — open one Release (fields, points rollups, Release Notes as
                Markdown), optionally pulling its Stories via `include: ["stories"]`. Plan §5.1, §5.4.
*******************************************************************************************/

import { z } from 'zod';
import type { Connection } from 'jsforce';
import type { ImhotepConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { selectFields, shapeRecord, soqlEscape } from '../salesforce/query.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOne, resolveIncludes } from '../salesforce/resolve.js';
import { applyRichText } from './getProject.js';
import { toImhotepError, ImhotepError } from '../salesforce/errors.js';

const AVAILABLE_INCLUDES = ['stories'] as const;

export const getReleaseInputShape = {
  release: z.string().min(1).describe('The Release to open: name fragment, Id, or record URL.'),
  include: z
    .array(z.enum(AVAILABLE_INCLUDES))
    .optional()
    .describe('Related data to pull: "stories". Omit to use the configured defaults.'),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type GetReleaseInput = z.infer<z.ZodObject<typeof getReleaseInputShape>>;

export interface GetReleaseResult {
  release?: Record<string, unknown>;
  candidates?: Array<Record<string, unknown>>;
  note?: string | undefined;
}

export async function getRelease(
  input: GetReleaseInput,
  config: ImhotepConfig,
): Promise<GetReleaseResult> {
  const releaseObj = config.objects.release;
  const storyObj = config.objects.story;
  if (!releaseObj || !storyObj) throw new Error('Release/Story objects are not configured.');

  const includes = resolveIncludes(input.include, config.defaults?.getRelease?.include, [
    ...AVAILABLE_INCLUDES,
  ]);

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      const resolved = await resolveOne(conn, releaseObj, input.release, { org: input.org });
      if (!resolved.record) {
        return { candidates: resolved.candidates ?? [], note: resolved.note };
      }
      const release = applyRichText(resolved.record, releaseObj);

      if (includes.includes('stories')) {
        release.stories = await fetchReleaseStories(conn, config, release.id as string);
      }
      return { release };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Release' });
  }
}

/** Fetch a Release's Stories (skinny — no bodies), ordered like list_stories. */
async function fetchReleaseStories(
  conn: Connection,
  config: ImhotepConfig,
  releaseId: string,
): Promise<Array<Record<string, unknown>>> {
  const storyObj = config.objects.story!;
  const richText = new Set(storyObj.richTextFields ?? []);
  const fields = selectFields(storyObj).filter(
    (f) => !richText.has(f.logical) || f.logical === 'title',
  );
  const select = ['Id', ...fields.map((f) => f.api)].join(', ');
  const sobject = nsApiName(storyObj.apiName);
  const releaseApi = nsApiName(storyObj.fields.release ?? 'Release__c');
  const priorityApi = nsApiName(storyObj.fields.priorityOrder ?? 'Priority_Order__c');
  const numApi = nsApiName(storyObj.fields.storyNumber ?? 'Story_Number__c');
  const soql =
    `SELECT ${select} FROM ${sobject} WHERE ${releaseApi} = '${soqlEscape(releaseId)}' ` +
    `ORDER BY ${priorityApi} ASC NULLS LAST, ${numApi} ASC LIMIT 500`;
  const res = await conn.query<Record<string, unknown>>(soql);
  return res.records.map((r) => shapeRecord(r, fields));
}
