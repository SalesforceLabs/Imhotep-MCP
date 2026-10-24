/*******************************************************************************************
@Name           tools/transferStories
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           10/24/2026
@Description    imhotep_transfer_stories — move 1–200 Stories to another Release in one
                all-or-nothing call (e.g. "move these to the backlog"). A top-level `to_release`
                applies to every item unless the item names its own. Like imhotep_transfer_story,
                each Story's Project is re-pointed to the destination Release's Project in the same
                write, and a Release name resolves within the Story's current Project (so
                "Backlog" is unambiguous). If any item fails, nothing is moved.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOneInProject } from '../salesforce/context.js';
import { autonomousNote } from '../salesforce/write.js';
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

const transferItem = z.object({
  story: z
    .string()
    .min(1)
    .describe('The Story to move: Story number (e.g. S000528), Id, or record URL.'),
  to_release: z
    .string()
    .optional()
    .describe('Destination Release for this Story (name, Id, or URL). Overrides to_release.'),
});

export const transferStoriesInputShape = {
  stories: z
    .array(transferItem)
    .min(1)
    .max(MAX_BULK_ITEMS)
    .describe(`The Stories to move (1–${MAX_BULK_ITEMS}). Each Story may appear once.`),
  to_release: z
    .string()
    .optional()
    .describe(
      'Destination Release for every Story (name, Id, or URL). For "move to backlog", use the ' +
        'backlog Release.',
    ),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type TransferStoriesInput = z.infer<z.ZodObject<typeof transferStoriesInputShape>>;

export async function transferStories(
  input: TransferStoriesInput,
  config: ImhotepConfig,
): Promise<BulkResult> {
  const storyObj = config.objects.story;
  const releaseObj = config.objects.release;
  if (!storyObj || !releaseObj) throw new Error('Story/Release objects are not configured.');

  const releaseApi = nsApiName(storyObj.fields.release ?? 'Release__c');
  const projectApi = nsApiName(storyObj.fields.project ?? 'Project__c');
  const items = input.stories;
  const failures: BulkFailure[] = [];

  items.forEach((item, index) => {
    if (!(item.to_release ?? input.to_release)) {
      failures.push({
        index,
        reference: item.story,
        message: 'No destination Release given (item to_release or top-level to_release).',
      });
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
      failures.push(
        ...findDuplicates(
          items.map((_, i) => resolved.byIndex.get(i)?.id as string | undefined),
          'Story',
        ),
      );

      // Resolve each distinct (Release reference, Story's Project) pair once.
      const releases = new Map<
        string,
        { id: string; project: string } | Omit<BulkFailure, 'index'>
      >();
      const payloads: Array<Record<string, unknown>> = [];
      for (const [index, item] of items.entries()) {
        const story = resolved.byIndex.get(index);
        const ref = item.to_release ?? input.to_release;
        if (!story || !ref) continue;
        const storyProject = (story.project as string | null) ?? null;
        const key = `${ref}|${storyProject ?? ''}`;
        if (!releases.has(key)) {
          const rel = await resolveOneInProject(conn, releaseObj, ref, storyProject, {
            org: input.org,
          });
          if (!rel.record) {
            releases.set(key, {
              reference: ref,
              message: rel.note ?? 'Could not resolve the destination Release.',
              ...(rel.candidates?.length ? { candidates: rel.candidates } : {}),
            });
          } else if (!rel.record.project) {
            releases.set(key, {
              reference: ref,
              message: `The destination Release "${rel.record.name ?? ref}" has no Project, so the Story's Project can't be kept consistent.`,
            });
          } else {
            releases.set(key, {
              id: rel.record.id as string,
              project: rel.record.project as string,
            });
          }
        }
        const rel = releases.get(key)!;
        if ('message' in rel) {
          failures.push({ ...rel, index });
          continue;
        }
        // Re-point Release AND Project together to preserve the invariant.
        payloads[index] = { Id: story.id, [releaseApi]: rel.id, [projectApi]: rel.project };
      }

      if (failures.length > 0) return rejectBatch(failures, items.length);

      const saved = await saveAllOrNone(conn, storyObj, 'update', payloads);
      if ('failures' in saved) return rejectBatch(saved.failures, items.length);

      const stories = await fetchSkinnyInOrder(conn, storyObj, saved.ids);
      const numbers = stories.map((s) => s.storyNumber ?? s.id).join(', ');
      return {
        ok: true,
        written: stories.length,
        stories,
        note: `Moved ${stories.length} Stories: ${numbers}. ${autonomousNote(config)}`,
      };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Story' });
  }
}
