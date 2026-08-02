/*******************************************************************************************
@Name           tools/listProjects
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_list_projects — locate/enumerate Projects by name fragment and/or status
                (a pasted Id/URL short-circuits to a direct fetch). The Project is the top of the
                hierarchy, so most work starts here. Plan §5.1, §5.5.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { classifyRecordRef } from '../util/recordRef.js';
import { selectClause, selectFields, shapeRecord, soqlEscape } from '../salesforce/query.js';
import { withConnection } from '../salesforce/connection.js';
import { toImhotepError } from '../salesforce/errors.js';

export const listProjectsInputShape = {
  query: z
    .string()
    .optional()
    .describe('Optional name fragment, or a pasted Salesforce Id / record URL to fetch directly.'),
  status: z
    .enum(['Planning', 'Active', 'Completed'])
    .optional()
    .describe('Optional status filter.'),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type ListProjectsInput = z.infer<z.ZodObject<typeof listProjectsInputShape>>;

export interface ListProjectsResult {
  projects: Array<Record<string, unknown>>;
}

export async function listProjects(
  input: ListProjectsInput,
  config: ImhotepConfig,
): Promise<ListProjectsResult> {
  const project = config.objects.project;
  if (!project) throw new Error('Project object is not configured.');

  const fields = selectFields(project);
  const select = selectClause(project);
  const sobject = nsApiName(project.apiName);
  const nameApi = project.nameField ?? 'Name';
  const statusApi = nsApiName(project.fields.status ?? 'Status__c');

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      // Id/URL short-circuit: fetch that one record directly.
      if (input.query) {
        const ref = classifyRecordRef(input.query, { allowStoryNumber: false });
        if (ref.id) {
          const soql = `SELECT ${select} FROM ${sobject} WHERE Id = '${soqlEscape(ref.id)}' LIMIT 1`;
          const res = await conn.query<Record<string, unknown>>(soql);
          return { projects: res.records.map((r) => shapeRecord(r, fields)) };
        }
      }

      const where: string[] = [];
      if (input.query) where.push(`${nameApi} LIKE '%${soqlEscape(input.query)}%'`);
      if (input.status) where.push(`${statusApi} = '${soqlEscape(input.status)}'`);
      const whereClause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const soql = `SELECT ${select} FROM ${sobject}${whereClause} ORDER BY ${nameApi} LIMIT 200`;
      const res = await conn.query<Record<string, unknown>>(soql);
      return { projects: res.records.map((r) => shapeRecord(r, fields)) };
    });
  } catch (err) {
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Project' });
  }
}
