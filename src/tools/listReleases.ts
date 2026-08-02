/*******************************************************************************************
@Name           tools/listReleases
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_list_releases — list a Project's Releases (points goal/remaining, dates,
                and the backlog flag), optionally filtered by status or to the backlog Release(s).
                Plan §5.1.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { selectClause, selectFields, shapeRecord, soqlEscape } from '../salesforce/query.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOne } from '../salesforce/resolve.js';
import { toImhotepError, ImhotepError } from '../salesforce/errors.js';

export const listReleasesInputShape = {
  project: z
    .string()
    .describe('The Project whose Releases to list: name fragment, Id, or record URL.'),
  status: z.enum(['Planning', 'Active', 'Accepted']).optional().describe('Optional status filter.'),
  is_backlog: z
    .boolean()
    .optional()
    .describe('When true, return only the backlog Release(s) for the Project.'),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type ListReleasesInput = z.infer<z.ZodObject<typeof listReleasesInputShape>>;

export interface ListReleasesResult {
  project?: Record<string, unknown>;
  releases?: Array<Record<string, unknown>>;
  /** Present when the project reference was ambiguous — caller should pick one. */
  projectCandidates?: Array<Record<string, unknown>>;
  note?: string | undefined;
}

export async function listReleases(
  input: ListReleasesInput,
  config: ImhotepConfig,
): Promise<ListReleasesResult> {
  const projectObj = config.objects.project;
  const releaseObj = config.objects.release;
  if (!projectObj || !releaseObj) throw new Error('Project/Release objects are not configured.');

  const fields = selectFields(releaseObj);
  const select = selectClause(releaseObj);
  const sobject = nsApiName(releaseObj.apiName);
  const projectApi = nsApiName(releaseObj.fields.project ?? 'Project__c');
  const statusApi = nsApiName(releaseObj.fields.status ?? 'Status__c');
  const backlogApi = nsApiName(releaseObj.fields.isBacklog ?? 'Is_Backlog__c');
  const nameApi = releaseObj.nameField ?? 'Name';

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      // Resolve the Project to exactly one record first.
      const resolved = await resolveOne(conn, projectObj, input.project, { org: input.org });
      if (!resolved.record) {
        return {
          projectCandidates: resolved.candidates ?? [],
          note: resolved.note ?? 'Could not resolve the Project.',
        };
      }
      const projectId = resolved.record.id as string;

      const where = [`${projectApi} = '${soqlEscape(projectId)}'`];
      if (input.status) where.push(`${statusApi} = '${soqlEscape(input.status)}'`);
      if (input.is_backlog) where.push(`${backlogApi} = true`);
      const soql = `SELECT ${select} FROM ${sobject} WHERE ${where.join(
        ' AND ',
      )} ORDER BY ${nameApi} LIMIT 200`;
      const res = await conn.query<Record<string, unknown>>(soql);
      return {
        project: resolved.record,
        releases: res.records.map((r) => shapeRecord(r, fields)),
      };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Release' });
  }
}
