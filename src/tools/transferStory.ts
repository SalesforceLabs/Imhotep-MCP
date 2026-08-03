/*******************************************************************************************
@Name           tools/transferStory
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_transfer_story — move a Story to another Release. Enforces the invariant
                that Story.Project must equal Release.Project (§5.2, §5.5) by re-pointing
                iab__Project__c to the target Release's Project in the same update. "Move to
                backlog" = transfer to the backlog Release. Verify-after-write. Plan §5.2.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOne } from '../salesforce/resolve.js';
import { verifyAfterWrite, autonomousNote, type SaveResult } from '../salesforce/write.js';
import { toImhotepError, ImhotepError } from '../salesforce/errors.js';

export const transferStoryInputShape = {
  story: z.string().min(1).describe('The Story to move: number, Id, URL, or title fragment.'),
  to_release: z
    .string()
    .min(1)
    .describe('The destination Release (name, Id, or URL). For "move to backlog", use the backlog Release.'),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type TransferStoryInput = z.infer<z.ZodObject<typeof transferStoryInputShape>>;

export interface TransferStoryResult {
  story?: Record<string, unknown>;
  note?: string | undefined;
  storyCandidates?: Array<Record<string, unknown>>;
  releaseCandidates?: Array<Record<string, unknown>>;
}

export async function transferStory(
  input: TransferStoryInput,
  config: ImhotepConfig,
): Promise<TransferStoryResult> {
  const storyObj = config.objects.story;
  const releaseObj = config.objects.release;
  if (!storyObj || !releaseObj) throw new Error('Story/Release objects are not configured.');

  const releaseApi = nsApiName(storyObj.fields.release ?? 'Release__c');
  const projectApi = nsApiName(storyObj.fields.project ?? 'Project__c');

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      // Resolve the Story.
      const story = await resolveOne(conn, storyObj, input.story, {
        org: input.org,
        allowStoryNumber: true,
      });
      if (!story.record) {
        return { storyCandidates: story.candidates ?? [], note: story.note ?? 'Could not resolve the Story.' };
      }
      const storyId = story.record.id as string;

      // Resolve the destination Release and derive its Project.
      const rel = await resolveOne(conn, releaseObj, input.to_release, { org: input.org });
      if (!rel.record) {
        return { releaseCandidates: rel.candidates ?? [], note: rel.note ?? 'Could not resolve the destination Release.' };
      }
      const releaseId = rel.record.id as string;
      const projectId = rel.record.project as string | null;
      if (!projectId) {
        throw new ImhotepError(
          `The destination Release "${rel.record.name ?? releaseId}" has no Project, so the Story's Project can't be kept consistent.`,
        );
      }

      const crossProject = (story.record.project as string | null) !== projectId;

      // Re-point Release AND Project together to preserve the invariant.
      const updated = (await conn.sobject(nsApiName(storyObj.apiName)).update({
        Id: storyId,
        [releaseApi]: releaseId,
        [projectApi]: projectId,
      } as never)) as unknown as SaveResult;
      if (!updated.success) {
        throw new ImhotepError(`Transfer failed: ${JSON.stringify(updated.errors)}`);
      }

      const result = await verifyAfterWrite(conn, storyObj, storyId);
      const crossNote = crossProject ? ' (moved across Projects; Project re-pointed to match the new Release)' : '';
      return {
        story: result,
        note: `Moved ${result.storyNumber ?? storyId} to Release "${rel.record.name ?? releaseId}"${crossNote}. ${autonomousNote(config)}`,
      };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Story' });
  }
}
