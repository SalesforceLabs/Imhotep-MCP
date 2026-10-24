/*******************************************************************************************
@Name           tools/updateStories
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           10/24/2026
@Description    imhotep_update_stories — update writable fields on 1–200 Stories in one
                all-or-nothing call (e.g. "mark these five Ready"). Each item names its Story by
                number, Id, or URL (no title fragments in a batch) plus only the fields to change.
                Same field rules as imhotep_update_story: Markdown in, read-only fields refused,
                picklists and lengths validated. If any item fails, nothing is saved.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { withConnection } from '../salesforce/connection.js';
import { buildWritePayload, validatePicklist, autonomousNote } from '../salesforce/write.js';
import {
  MAX_BULK_ITEMS,
  rejectBatch,
  findDuplicates,
  resolveStoriesStrict,
  saveAllOrNone,
  fetchSkinnyInOrder,
  type BulkFailure,
  type BulkResult,
} from '../salesforce/bulk.js';
import { toImhotepError, ImhotepError } from '../salesforce/errors.js';

const updateItem = z.object({
  story: z
    .string()
    .min(1)
    .describe('The Story to update: Story number (e.g. S000528), Id, or record URL.'),
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
});

export const updateStoriesInputShape = {
  stories: z
    .array(updateItem)
    .min(1)
    .max(MAX_BULK_ITEMS)
    .describe(
      `The Stories to update (1–${MAX_BULK_ITEMS}), each with only the fields to change. ` +
        'Each Story may appear once.',
    ),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type UpdateStoriesInput = z.infer<z.ZodObject<typeof updateStoriesInputShape>>;
type UpdateItem = z.infer<typeof updateItem>;

/** Map one item's tool args to logical Story field names (undefined = leave unchanged). */
export function toLogicalUpdate(item: UpdateItem): Record<string, unknown> {
  return {
    title: item.title,
    description: item.description,
    acceptanceCriteria: item.acceptance_criteria,
    buildNotes: item.build_notes,
    deploymentChecklist: item.deployment_checklist,
    status: item.status,
    type: item.type,
    estimatedPoints: item.estimated_points,
    actualPoints: item.actual_points,
    priorityOrder: item.priority_order,
  };
}

export async function updateStories(
  input: UpdateStoriesInput,
  config: ImhotepConfig,
): Promise<BulkResult> {
  const storyObj = config.objects.story;
  if (!storyObj) throw new Error('Story object is not configured.');

  const items = input.stories;
  const failures: BulkFailure[] = [];
  const payloads: Array<Record<string, unknown>> = [];

  // Offline checks: something to change, valid picklists, and the shared payload rules.
  items.forEach((item, index) => {
    try {
      const logical = toLogicalUpdate(item);
      if (!Object.values(logical).some((v) => v !== undefined)) {
        throw new ImhotepError(
          'No writable fields given for this Story. Provide at least one field to change.',
        );
      }
      if (item.status) validatePicklist(storyObj, 'status', item.status);
      if (item.type) validatePicklist(storyObj, 'type', item.type);
      payloads[index] = buildWritePayload(storyObj, 'story', logical, config);
    } catch (err) {
      failures.push({ index, reference: item.story, message: (err as Error).message });
    }
  });

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      const resolved = await resolveStoriesStrict(
        conn,
        storyObj,
        items.map((i) => i.story),
        'Story',
      );
      failures.push(...resolved.failures);
      // Two items pointing at the same record (e.g. "528" and its Id) can't share one update.
      failures.push(
        ...findDuplicates(
          items.map((_, i) => resolved.byIndex.get(i)?.id as string | undefined),
          'Story',
        ),
      );

      if (failures.length > 0) return rejectBatch(failures, items.length);

      items.forEach((_, index) => {
        payloads[index]!.Id = resolved.byIndex.get(index)!.id;
      });
      const saved = await saveAllOrNone(conn, storyObj, 'update', payloads);
      if ('failures' in saved) return rejectBatch(saved.failures, items.length);

      const stories = await fetchSkinnyInOrder(conn, storyObj, saved.ids);
      const numbers = stories.map((s) => s.storyNumber ?? s.id).join(', ');
      return {
        ok: true,
        written: stories.length,
        stories,
        note: `Updated ${stories.length} Stories: ${numbers}. ${autonomousNote(config)}`,
      };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Story' });
  }
}
