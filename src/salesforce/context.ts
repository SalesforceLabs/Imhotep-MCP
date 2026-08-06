/*******************************************************************************************
@Name           salesforce/context
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Working-context resolution (plan §5.5): when a tool's `project`/`release` is
                omitted, fall back to the configured working context (project/global config), so
                "what's in flight" works without restating context. Also provides PROJECT-SCOPED
                name resolution for sub-project references (release/tag/etc.) — resolving a name
                within the known Project rather than org-wide, which removes cross-project
                ambiguity (e.g. every Project has a "Backlog" Release).
*******************************************************************************************/

import type { Connection } from 'jsforce';
import type { ImhotepConfig, ObjectConfig } from '../config/schema.js';
import { classifyRecordRef } from '../util/recordRef.js';
import { nsApiName } from '../util/namespace.js';
import { selectClause, selectFields, shapeRecord, soqlEscape } from './query.js';
import { resolveOne, type ResolveResult } from './resolve.js';

// Org-resolution precedence (§5.5: per-call `org` → config `defaultImhotepOrg` → CLI default) is applied
// centrally in the server's tool wrapper, so tools just read their `org` arg.

/**
 * Resolve the working-context PROJECT reference: the per-call value if given, else the
 * configured default (§5.5 precedence: per-call → project/global config `defaultImhotepProject`).
 * Returns the reference string to resolve, or null if none is available (caller should ask).
 */
export function contextProjectRef(
  perCall: string | undefined,
  config: ImhotepConfig,
): string | null {
  // New key first; fall back to the deprecated alias in case a raw (un-normalized) config is passed.
  return perCall ?? config.defaultImhotepProject ?? config.defaultProject ?? null;
}

/**
 * Resolve the working-context RELEASE reference: per-call value, else configured
 * `currentImhotepRelease`. Returns null if none available.
 */
export function contextReleaseRef(
  perCall: string | undefined,
  config: ImhotepConfig,
): string | null {
  return perCall ?? config.currentImhotepRelease ?? config.currentRelease ?? null;
}

/**
 * Project-scoped resolution of a sub-project record by reference. If the reference is an Id/URL
 * it short-circuits (context-independent). If it's a NAME and a `projectId` is known, the search
 * is filtered to that Project via the object's project lookup field — so a name like "Backlog"
 * resolves unambiguously within the working Project instead of org-wide. Falls back to org-wide
 * `resolveOne` when no project context is available.
 */
export async function resolveOneInProject(
  conn: Connection,
  obj: ObjectConfig,
  input: string,
  projectId: string | null,
  opts: { org?: string | undefined; allowStoryNumber?: boolean } = {},
): Promise<ResolveResult> {
  const ref = classifyRecordRef(input, { allowStoryNumber: opts.allowStoryNumber ?? false });

  // Id/URL → context-independent; defer to the standard resolver.
  if (ref.id) return resolveOne(conn, obj, input, opts);
  // No project context, or the object has no project lookup → fall back to org-wide.
  const projectField = obj.fields.project;
  if (!projectId || !projectField) return resolveOne(conn, obj, input, opts);

  // Name fragment, project known → scoped Name LIKE within the Project.
  const fields = selectFields(obj);
  const select = selectClause(obj);
  const sobject = nsApiName(obj.apiName);
  const nameApi = obj.nameField ?? 'Name';
  const projectApi = nsApiName(projectField);
  const fragment = ref.fragment ?? ref.raw;
  const like = `%${soqlEscape(fragment)}%`;
  const soql =
    `SELECT ${select} FROM ${sobject} ` +
    `WHERE ${projectApi} = '${soqlEscape(projectId)}' AND ${nameApi} LIKE '${like}' ` +
    `ORDER BY ${nameApi} LIMIT 10`;
  const res = await conn.query<Record<string, unknown>>(soql);
  if (res.records.length === 1) return { record: shapeRecord(res.records[0]!, fields) };
  const orgSuffix = opts.org ? ` in org "${opts.org}"` : '';
  return {
    candidates: res.records.map((r) => shapeRecord(r, fields)),
    note:
      res.records.length === 0
        ? `No ${obj.apiName} named like "${fragment}" in this Project${orgSuffix}.`
        : `No exact match for "${fragment}" in this Project; ${res.records.length} candidate(s).`,
  };
}
