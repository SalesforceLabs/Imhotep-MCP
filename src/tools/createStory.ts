/*******************************************************************************************
@Name           tools/createStory
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_create_story — create a Story. Derives Project from the Release
                automatically (the validation trap: Story.Project must equal Release.Project —
                §5.2). Resolves record-type name→Id (default Standard). Set parent_story to create
                a child Story. Rich-text bodies are authored in Markdown (→HTML). Returns the new
                SNNNNNN via verify-after-write. Plan §5.2, §5.5.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';
import { htmlToMarkdown } from '../util/richtext.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOne } from '../salesforce/resolve.js';
import { contextReleaseRef } from '../salesforce/context.js';
import {
  buildWritePayload,
  validatePicklist,
  resolveRecordTypeId,
  verifyAfterWrite,
  autonomousNote,
  type SaveResult,
} from '../salesforce/write.js';
import { toImhotepError, ImhotepError } from '../salesforce/errors.js';

export const createStoryInputShape = {
  release: z
    .string()
    .optional()
    .describe(
      'The Release to create the Story under (name, Id, or URL). ' +
        'Defaults to the configured currentRelease when omitted.',
    ),
  title: z.string().min(1).describe('The Story title (the Name field).'),
  description: z.string().optional().describe('Short user story (Markdown).'),
  acceptance_criteria: z.string().optional().describe('Acceptance criteria / DoD + tests (Markdown).'),
  build_notes: z.string().optional().describe('Solution build / implementation notes (Markdown).'),
  deployment_checklist: z.string().optional().describe('Manual deploy steps (Markdown).'),
  type: z.enum(['New', 'Change', 'Defect']).default('New').describe('Story type.'),
  status: z
    .enum(['Blocked', 'Defined', 'Building', 'Testing', 'Ready', 'Deployed'])
    .default('Defined')
    .describe('Story status.'),
  parent_story: z
    .string()
    .optional()
    .describe('Parent Story (number, Id, or URL) — set to create a child Story.'),
  estimated_points: z.number().optional().describe('Estimated points.'),
  priority_order: z.number().optional().describe('Priority order (lower = higher priority).'),
  record_type: z
    .enum(['Simple', 'Standard'])
    .optional()
    .describe('Record type (defaults to the configured default, normally Standard).'),
  org: z.string().optional().describe('Optional Salesforce org alias/username to target.'),
};

export type CreateStoryInput = z.infer<z.ZodObject<typeof createStoryInputShape>>;

export interface CreateStoryResult {
  story?: Record<string, unknown>;
  note?: string | undefined;
  /** Present when the release/parent reference was ambiguous — caller should disambiguate. */
  releaseCandidates?: Array<Record<string, unknown>>;
  parentCandidates?: Array<Record<string, unknown>>;
}

export async function createStory(
  input: CreateStoryInput,
  config: ImhotepConfig,
): Promise<CreateStoryResult> {
  const storyObj = config.objects.story;
  const releaseObj = config.objects.release;
  if (!storyObj || !releaseObj) throw new Error('Story/Release objects are not configured.');

  validatePicklist(storyObj, 'status', input.status);
  validatePicklist(storyObj, 'type', input.type);

  try {
    return await withConnection(input.org, config.apiVersion, async (conn) => {
      // Working context (§5.5): fall back to configured currentRelease when omitted.
      const releaseRef = contextReleaseRef(input.release, config);
      if (!releaseRef) {
        return { note: 'No Release given and no currentRelease configured. Name a release, or set currentRelease via set_config.' };
      }
      // Resolve the Release, then DERIVE Project from it (avoids the validation trap).
      const rel = await resolveOne(conn, releaseObj, releaseRef, { org: input.org });
      if (!rel.record) {
        return { releaseCandidates: rel.candidates ?? [], note: rel.note ?? 'Could not resolve the Release.' };
      }
      const releaseId = rel.record.id as string;
      const projectId = rel.record.project as string | null;
      if (!projectId) {
        throw new ImhotepError(
          `The Release "${rel.record.name ?? releaseId}" has no Project, so the Story's Project can't be derived.`,
        );
      }

      // Optional parent Story.
      let parentId: string | undefined;
      if (input.parent_story) {
        const parent = await resolveOne(conn, storyObj, input.parent_story, {
          org: input.org,
          allowStoryNumber: true,
        });
        if (!parent.record) {
          return { parentCandidates: parent.candidates ?? [], note: parent.note ?? 'Could not resolve the parent Story.' };
        }
        parentId = parent.record.id as string;
      }

      // Build the write payload from logical values (read-only refusal + MD→HTML happen here).
      const logical: Record<string, unknown> = {
        title: input.title,
        release: releaseId,
        project: projectId,
        status: input.status,
        type: input.type,
        description: input.description,
        acceptanceCriteria: input.acceptance_criteria,
        buildNotes: input.build_notes,
        deploymentChecklist: input.deployment_checklist,
        estimatedPoints: input.estimated_points,
        priorityOrder: input.priority_order,
        parentStory: parentId,
      };
      const payload = buildWritePayload(storyObj, 'story', logical, config);

      // Record type (default from config, normally Standard).
      const rtName = input.record_type ?? storyObj.recordTypes?.default;
      if (rtName) {
        payload.RecordTypeId = await resolveRecordTypeId(
          conn,
          storyObj,
          rtName,
          input.org ?? '(default)',
        );
      }

      const created = (await conn
        .sobject(nsApiName(storyObj.apiName))
        .create(payload as never)) as unknown as SaveResult;
      if (!created.success || !created.id) {
        throw new ImhotepError(`Create failed: ${JSON.stringify(created.errors)}`);
      }

      const story = await verifyAfterWrite(conn, storyObj, created.id);
      // Return bodies as Markdown for a friendly result.
      for (const logicalBody of storyObj.richTextFields ?? []) {
        if (logicalBody in story) story[logicalBody] = htmlToMarkdown(story[logicalBody] as string | null);
      }
      return { story, note: `Created ${story.storyNumber ?? '(new Story)'}. ${autonomousNote(config)}` };
    });
  } catch (err) {
    if (err instanceof ImhotepError) throw err;
    throw toImhotepError(err, { org: input.org ?? '(default)', object: 'Story' });
  }
}
