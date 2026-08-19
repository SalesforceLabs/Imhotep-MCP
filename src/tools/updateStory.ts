/*******************************************************************************************
@Name           tools/updateStory
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_update_story — update any writable Story field (scalar or rich-text),
                including `status` (validated against the picklist). Markdown in, HTML out.
                Refuses system-maintained fields. Covers "mark S000528 Ready" via `status`.
                Verify-after-write returns the persisted record. Plan §5.2, §5.5.
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

export const updateStoryInputShape = {
  story: z.string().min(1).describe('The Story to update: number, Id, URL, or title fragment.'),
  title: z.string().max(80).optional().describe('New title (Name). Max 80 characters.'),
  description: z.string().optional().describe('Short user story (Markdown).'),
  acceptance_criteria: z
    .string()
    .optional()
    .describe('Acceptance criteria / DoD + tests (Markdown).'),
  build_notes: z.string().optional().describe('Solution build / implementation notes (Markdown).'),
  deployment_checklist: z.string().optional().describe('Manual deploy steps (Markdown).'),
  status: z
    .enum(['Blocked', 'Defined', 'Building', 'Testing', 'Ready', 'Deployed'])
    .optional()
    .describe('New status (e.g. "Ready").'),
  type: z.enum(['New', 'Change', 'Defect']).optional().describe('New type.'),
  estimated_points: z.number().optional().describe('Estimated points.'),
  actual_points: z.number().optional().describe('Actual points.'),
  priority_order: z.number().optional().describe('Priority order.'),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type UpdateStoryInput = z.infer<z.ZodObject<typeof updateStoryInputShape>>;

export interface UpdateStoryResult {
  story?: Record<string, unknown>;
  note?: string | undefined;
  candidates?: Array<Record<string, unknown>>;
}

export async function updateStory(
  input: UpdateStoryInput,
  config: ImhotepConfig,
): Promise<UpdateStoryResult> {
  const storyObj = config.objects.story;
  if (!storyObj) throw new Error('Story object is not configured.');

  if (input.status) validatePicklist(storyObj, 'status', input.status);
  if (input.type) validatePicklist(storyObj, 'type', input.type);

  // Map tool args → logical field names (only those provided).
  const logical: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    acceptanceCriteria: input.acceptance_criteria,
    buildNotes: input.build_notes,
    deploymentChecklist: input.deployment_checklist,
    status: input.status,
    type: input.type,
    estimatedPoints: input.estimated_points,
    actualPoints: input.actual_points,
    priorityOrder: input.priority_order,
  };
  const hasChange = Object.values(logical).some((v) => v !== undefined);
  if (!hasChange) {
    throw new ImhotepError(
      'No writable Story fields were provided to update. Provide at least one of: title, ' +
        'description, acceptance_criteria, build_notes, deployment_checklist, status, type, ' +
        'estimated_points, actual_points, priority_order. (System-maintained fields such as the ' +
        'Story number and Points are read-only and cannot be set.)',
    );
  }

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      const resolved = await resolveOne(conn, storyObj, input.story, {
        org: input.org,
        allowStoryNumber: true,
      });
      if (!resolved.record) {
        return { candidates: resolved.candidates ?? [], note: resolved.note };
      }
      const id = resolved.record.id as string;

      const payload = buildWritePayload(storyObj, 'story', logical, config);
      payload.Id = id;
      const updated = (await conn
        .sobject(nsApiName(storyObj.apiName))
        .update(payload as never)) as unknown as SaveResult;
      if (!updated.success) {
        throw new ImhotepError(`Update failed: ${JSON.stringify(updated.errors)}`);
      }

      const story = await verifyAfterWrite(conn, storyObj, id);
      for (const body of storyObj.richTextFields ?? []) {
        if (body in story) story[body] = htmlToMarkdown(story[body] as string | null);
      }
      return { story, note: `Updated ${story.storyNumber ?? id}. ${autonomousNote(config)}` };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Story' });
  }
}
