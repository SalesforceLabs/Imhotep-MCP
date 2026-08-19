/*******************************************************************************************
@Name           tools/updateRelease
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_update_release — update any writable Release field (status, dates, points
                goal, backlog flag, description, and rich-text Release Notes / iab__Notes__c
                Markdown→HTML). Refuses system-maintained (formula/rollup) fields. Verify-after-
                write. Plan §5.2.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { htmlToMarkdown } from '../util/richtext.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOne } from '../salesforce/resolve.js';
import {
  buildWritePayload,
  validatePicklist,
  verifyAfterWrite,
  autonomousNote,
  type SaveResult,
} from '../salesforce/write.js';
import { toImhotepError, ImhotepError } from '../salesforce/errors.js';

export const updateReleaseInputShape = {
  release: z.string().min(1).describe('The Release to update: name, Id, or URL.'),
  status: z.enum(['Planning', 'Active', 'Accepted']).optional().describe('New status.'),
  release_mode: z.enum(['Standard', 'Simple']).optional().describe('Release mode.'),
  is_backlog: z.boolean().optional().describe('Backlog flag.'),
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD).'),
  release_date: z.string().optional().describe('Release date (YYYY-MM-DD).'),
  points_goal: z.number().optional().describe('Points goal.'),
  notes: z.string().optional().describe('Release Notes (Markdown → HTML). Max 32768 characters.'),
  description: z
    .string()
    .max(1000)
    .optional()
    .describe('Description (plain text). Max 1000 characters.'),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type UpdateReleaseInput = z.infer<z.ZodObject<typeof updateReleaseInputShape>>;

export interface UpdateReleaseResult {
  release?: Record<string, unknown>;
  note?: string | undefined;
  candidates?: Array<Record<string, unknown>>;
}

export async function updateRelease(
  input: UpdateReleaseInput,
  config: ImhotepConfig,
): Promise<UpdateReleaseResult> {
  const releaseObj = config.objects.release;
  if (!releaseObj) throw new Error('Release object is not configured.');

  if (input.status) validatePicklist(releaseObj, 'status', input.status);
  if (input.release_mode) validatePicklist(releaseObj, 'releaseMode', input.release_mode);

  const logical: Record<string, unknown> = {
    status: input.status,
    releaseMode: input.release_mode,
    isBacklog: input.is_backlog,
    startDate: input.start_date,
    releaseDate: input.release_date,
    pointsGoal: input.points_goal,
    notes: input.notes,
    description: input.description,
  };
  if (!Object.values(logical).some((v) => v !== undefined)) {
    throw new ImhotepError(
      'No writable Release fields were provided to update. Provide at least one of: status, ' +
        'release_mode, is_backlog, start_date, release_date, points_goal, notes, description. ' +
        '(System-maintained rollup fields such as Total Points are read-only and cannot be set.)',
    );
  }

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      const resolved = await resolveOne(conn, releaseObj, input.release, { org: input.org });
      if (!resolved.record) {
        return { candidates: resolved.candidates ?? [], note: resolved.note };
      }
      const id = resolved.record.id as string;

      const payload = buildWritePayload(releaseObj, 'release', logical, config);
      payload.Id = id;
      const updated = (await conn
        .sobject(nsApiName(releaseObj.apiName))
        .update(payload as never)) as unknown as SaveResult;
      if (!updated.success) {
        throw new ImhotepError(`Update failed: ${JSON.stringify(updated.errors)}`);
      }

      const release = await verifyAfterWrite(conn, releaseObj, id);
      for (const body of releaseObj.richTextFields ?? []) {
        if (body in release) release[body] = htmlToMarkdown(release[body] as string | null);
      }
      return { release, note: `Updated Release ${release.name ?? id}. ${autonomousNote(config)}` };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Release' });
  }
}
