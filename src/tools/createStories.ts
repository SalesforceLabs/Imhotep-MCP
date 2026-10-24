/*******************************************************************************************
@Name           tools/createStories
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           10/24/2026
@Description    imhotep_create_stories — create 1–200 Stories in one all-or-nothing call. Batch
                `defaults` (release, type, status, record_type, parent_story) apply to every item
                unless the item overrides them. Each Story's Project is derived from its Release,
                exactly as imhotep_create_story does. Parent Stories must already exist (no
                references to Stories created in the same batch). Every item is validated before
                any write; if any item fails, nothing is saved and every failure is returned.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOne } from '../salesforce/resolve.js';
import { contextReleaseRef } from '../salesforce/context.js';
import {
  buildWritePayload,
  validatePicklist,
  resolveRecordTypeId,
  autonomousNote,
} from '../salesforce/write.js';
import {
  MAX_BULK_ITEMS,
  rejectBatch,
  resolveStoriesStrict,
  saveAllOrNone,
  fetchSkinnyInOrder,
  type BulkFailure,
  type BulkResult,
} from '../salesforce/bulk.js';
import { toImhotepError, ImhotepError } from '../salesforce/errors.js';

const typeEnum = z.enum(['New', 'Change', 'Defect']);
const statusEnum = z.enum(['Blocked', 'Defined', 'Building', 'Testing', 'Ready', 'Deployed']);
const recordTypeEnum = z.enum(['Simple', 'Standard']);

const storyItem = z.object({
  title: z.string().min(1).max(80).describe('The Story title (the Name field). Max 80 characters.'),
  release: z
    .string()
    .optional()
    .describe('Release for this Story (name, Id, or URL). Overrides defaults.release.'),
  description: z.string().optional().describe('Short user story (Markdown).'),
  acceptance_criteria: z
    .string()
    .optional()
    .describe('Acceptance criteria / DoD + tests (Markdown).'),
  build_notes: z.string().optional().describe('Solution build / implementation notes (Markdown).'),
  deployment_checklist: z.string().optional().describe('Manual deploy steps (Markdown).'),
  type: typeEnum.optional().describe('Story type. Overrides defaults.type.'),
  status: statusEnum.optional().describe('Story status. Overrides defaults.status.'),
  parent_story: z
    .string()
    .optional()
    .describe(
      'Existing parent Story (number, Id, or URL). Overrides defaults.parent_story. Must already ' +
        'exist — it cannot be a Story created in this same batch.',
    ),
  estimated_points: z.number().optional().describe('Estimated points.'),
  priority_order: z.number().optional().describe('Priority order (lower = higher priority).'),
  record_type: recordTypeEnum.optional().describe('Record type. Overrides defaults.record_type.'),
});

export const createStoriesInputShape = {
  stories: z
    .array(storyItem)
    .min(1)
    .max(MAX_BULK_ITEMS)
    .describe(`The Stories to create (1–${MAX_BULK_ITEMS}), returned in this order.`),
  defaults: z
    .object({
      release: z
        .string()
        .optional()
        .describe(
          'Release for every Story (name, Id, or URL). Falls back to the configured ' +
            'currentImhotepRelease when omitted.',
        ),
      type: typeEnum.optional().describe('Type for every Story (default New).'),
      status: statusEnum.optional().describe('Status for every Story (default Defined).'),
      record_type: recordTypeEnum
        .optional()
        .describe(
          'Record type for every Story (default: the configured default, normally Standard).',
        ),
      parent_story: z
        .string()
        .optional()
        .describe('Existing parent Story (number, Id, or URL) for every Story.'),
    })
    .optional()
    .describe('Values applied to every item unless the item sets its own.'),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type CreateStoriesInput = z.infer<z.ZodObject<typeof createStoriesInputShape>>;
type StoryItem = z.infer<typeof storyItem>;

/** One item with its batch defaults applied. */
interface MergedItem extends StoryItem {
  type: 'New' | 'Change' | 'Defect';
  status: 'Blocked' | 'Defined' | 'Building' | 'Testing' | 'Ready' | 'Deployed';
  releaseRef: string | null;
}

/** Apply batch defaults (then config / shipped defaults) to each item. Pure — exported for tests. */
export function mergeCreateDefaults(
  input: CreateStoriesInput,
  config: ImhotepConfig,
): MergedItem[] {
  const d = input.defaults ?? {};
  return input.stories.map((item) => ({
    ...item,
    type: item.type ?? d.type ?? 'New',
    status: item.status ?? d.status ?? 'Defined',
    record_type: item.record_type ?? d.record_type,
    parent_story: item.parent_story ?? d.parent_story,
    releaseRef: contextReleaseRef(item.release ?? d.release, config),
  }));
}

export async function createStories(
  input: CreateStoriesInput,
  config: ImhotepConfig,
): Promise<BulkResult> {
  const storyObj = config.objects.story;
  const releaseObj = config.objects.release;
  if (!storyObj || !releaseObj) throw new Error('Story/Release objects are not configured.');

  const items = mergeCreateDefaults(input, config);
  const failures: BulkFailure[] = [];

  // Offline checks first, so a malformed batch never touches the org.
  items.forEach((item, index) => {
    try {
      validatePicklist(storyObj, 'status', item.status);
      validatePicklist(storyObj, 'type', item.type);
    } catch (err) {
      failures.push({ index, message: (err as Error).message });
    }
    if (!item.releaseRef) {
      failures.push({
        index,
        message:
          'No Release given (item, defaults, or configured currentImhotepRelease). Name a release.',
      });
    }
  });

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      // Resolve each distinct Release once; Project is derived from it (the validation trap).
      const releases = new Map<
        string,
        { id: string; project: string } | Omit<BulkFailure, 'index'>
      >();
      for (const ref of new Set(items.map((i) => i.releaseRef).filter((r) => r !== null))) {
        const rel = await resolveOne(conn, releaseObj, ref, { org: input.org });
        if (!rel.record) {
          releases.set(ref, {
            reference: ref,
            message: rel.note ?? 'Could not resolve the Release.',
            ...(rel.candidates?.length ? { candidates: rel.candidates } : {}),
          });
        } else if (!rel.record.project) {
          releases.set(ref, {
            reference: ref,
            message: `The Release "${rel.record.name ?? ref}" has no Project, so the Story's Project can't be derived.`,
          });
        } else {
          releases.set(ref, { id: rel.record.id as string, project: rel.record.project as string });
        }
      }

      const parents = await resolveStoriesStrict(
        conn,
        storyObj,
        items.map((i) => i.parent_story),
        'parent Story',
      );
      failures.push(...parents.failures);

      // Resolve each distinct record type once (cached per org).
      const recordTypes = new Map<string, string | Error>();
      for (const name of new Set(
        items.map((i) => i.record_type ?? storyObj.recordTypes?.default).filter((n) => !!n),
      )) {
        try {
          recordTypes.set(
            name!,
            await resolveRecordTypeId(conn, storyObj, name!, input.org ?? '(default)'),
          );
        } catch (err) {
          recordTypes.set(name!, err as Error);
        }
      }

      const payloads: Array<Record<string, unknown>> = [];
      items.forEach((item, index) => {
        const rel = item.releaseRef ? releases.get(item.releaseRef) : undefined;
        if (rel && 'message' in rel) {
          failures.push({ ...rel, index });
          return;
        }
        if (!rel) return; // missing release already reported offline
        try {
          const payload = buildWritePayload(
            storyObj,
            'story',
            {
              title: item.title,
              release: rel.id,
              project: rel.project,
              status: item.status,
              type: item.type,
              description: item.description,
              acceptanceCriteria: item.acceptance_criteria,
              buildNotes: item.build_notes,
              deploymentChecklist: item.deployment_checklist,
              estimatedPoints: item.estimated_points,
              priorityOrder: item.priority_order,
              parentStory: parents.byIndex.get(index)?.id,
            },
            config,
          );
          const rtName = item.record_type ?? storyObj.recordTypes?.default;
          const rt = rtName ? recordTypes.get(rtName) : undefined;
          if (rt instanceof Error) throw rt;
          if (rt) payload.RecordTypeId = rt;
          payloads[index] = payload;
        } catch (err) {
          failures.push({ index, message: (err as Error).message });
        }
      });

      if (failures.length > 0) return rejectBatch(failures, items.length);

      const saved = await saveAllOrNone(conn, storyObj, 'create', payloads);
      if ('failures' in saved) return rejectBatch(saved.failures, items.length);

      const stories = await fetchSkinnyInOrder(conn, storyObj, saved.ids);
      const numbers = stories.map((s) => s.storyNumber ?? s.id).join(', ');
      return {
        ok: true,
        written: stories.length,
        stories,
        note: `Created ${stories.length} Stories: ${numbers}. ${autonomousNote(config)}`,
      };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Story' });
  }
}
