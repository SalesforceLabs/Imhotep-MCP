/*******************************************************************************************
@Name           tools/getProject
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_get_project — open one Project (core fields + point/count rollups),
                optionally pulling related data via `include`. v1 (Increment 2) ships the
                `releases` and `resources` includes; `metadata_components` and `members` arrive
                with their objects in v1.1. Related sets are fetched with follow-up queries against
                the child objects (keeps each result cleanly shaped). Plan §5.1, §5.4.
*******************************************************************************************/

import { z } from 'zod';
import type { Connection } from 'jsforce';
import type { ImhotepConfig, ObjectConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { htmlToMarkdown } from '../util/richtext.js';
import { selectClause, selectFields, shapeRecord, soqlEscape } from '../salesforce/query.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOne, resolveIncludes } from '../salesforce/resolve.js';
import { toImhotepError, ImhotepError } from '../salesforce/errors.js';

// v1 (Increment 2) ships releases + resources; metadata_components + members arrive in v1.1.
const AVAILABLE_INCLUDES = ['releases', 'resources'] as const;

export const getProjectInputShape = {
  project: z.string().min(1).describe('The Project to open: name fragment, Id, or record URL.'),
  include: z
    .array(z.enum(AVAILABLE_INCLUDES))
    .optional()
    .describe(
      'Related data to pull: "releases", "resources". Omit to use the configured defaults.',
    ),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type GetProjectInput = z.infer<z.ZodObject<typeof getProjectInputShape>>;

export interface GetProjectResult {
  project?: Record<string, unknown>;
  candidates?: Array<Record<string, unknown>>;
  note?: string | undefined;
}

export async function getProject(
  input: GetProjectInput,
  config: ImhotepConfig,
): Promise<GetProjectResult> {
  const projectObj = config.objects.project;
  if (!projectObj) throw new Error('Project object is not configured.');

  const includes = resolveIncludes(
    input.include,
    config.defaults?.getProject?.include,
    [...AVAILABLE_INCLUDES],
  );

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      const resolved = await resolveOne(conn, projectObj, input.project, { org: input.org });
      if (!resolved.record) {
        return { candidates: resolved.candidates ?? [], note: resolved.note };
      }
      const project = applyRichText(resolved.record, projectObj);
      const projectId = project.id as string;

      if (includes.includes('releases')) {
        project.releases = await fetchRelated(conn, config, 'release', 'project', projectId);
      }
      if (includes.includes('resources')) {
        project.resources = await fetchRelated(conn, config, 'resourceLink', 'project', projectId);
      }

      return { project };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Project' });
  }
}

/** Convert an object's rich-text fields from HTML to Markdown in-place; returns the object. */
export function applyRichText(
  record: Record<string, unknown>,
  obj: ObjectConfig,
): Record<string, unknown> {
  for (const logical of obj.richTextFields ?? []) {
    if (logical in record) record[logical] = htmlToMarkdown(record[logical] as string | null);
  }
  return record;
}

/**
 * Fetch child records of `parentId` for a configured child object, filtering on the given
 * parent-lookup field. Returns shaped rows. If the child object isn't configured, returns [].
 */
async function fetchRelated(
  conn: Connection,
  config: ImhotepConfig,
  childKey: string,
  parentField: string,
  parentId: string,
): Promise<Array<Record<string, unknown>>> {
  const child = config.objects[childKey];
  if (!child) return [];
  const fields = selectFields(child);
  const select = selectClause(child);
  const sobject = nsApiName(child.apiName);
  const lookupApi = nsApiName(child.fields[parentField] ?? `${parentField}__c`);
  const soql = `SELECT ${select} FROM ${sobject} WHERE ${lookupApi} = '${soqlEscape(parentId)}' LIMIT 500`;
  const res = await conn.query<Record<string, unknown>>(soql);
  return res.records.map((r) => shapeRecord(r, fields));
}
