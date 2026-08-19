/*******************************************************************************************
@Name           tools/setConfig
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_set_config — update a setting at the global or project scope. Two-step by
                design: without confirm=true it VALIDATES + returns a preview (what will change,
                where, before→after) and writes nothing; call again with confirm=true to commit.
                Validation resolves referenced values live (org authenticates? project/release
                exists?) to catch typos. Comment-preserving write; auto-creates the file. Plan §5.2, §7.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { readScopeConfig } from '../config/load.js';
import { configPathForScope, setConfigKey } from '../config/write.js';
import { withConnection } from '../salesforce/connection.js';
import { resolveOne } from '../salesforce/resolve.js';
import { getOrgAuth } from '../salesforce/auth.js';
import { ImhotepError } from '../salesforce/errors.js';

/** The settings set_config accepts, with the value type each expects. */
const SETTABLE_KEYS = [
  'defaultImhotepOrg',
  'defaultImhotepProject',
  'currentImhotepRelease',
  'autonomousMode',
  'skillAutoInstall',
] as const;
type SettableKey = (typeof SETTABLE_KEYS)[number];

export const setConfigInputShape = {
  key: z.enum(SETTABLE_KEYS).describe('The setting to change.'),
  value: z
    .union([z.string(), z.boolean()])
    .describe('The new value (boolean for autonomousMode/skillAutoInstall; string otherwise).'),
  scope: z
    .enum(['global', 'project'])
    .describe('Where to write: "global" (~/.imhotep) or "project" (./).'),
  confirm: z
    .boolean()
    .default(false)
    .describe('Set true to COMMIT. Without it, returns a validated preview and writes nothing.'),
};

export type SetConfigInput = z.infer<z.ZodObject<typeof setConfigInputShape>>;

export interface SetConfigResult {
  committed: boolean;
  key: string;
  scope: string;
  path: string;
  previous: unknown;
  next: unknown;
  /** Human-readable validation/preview note. */
  note: string;
}

export async function setConfig(
  input: SetConfigInput,
  config: ImhotepConfig,
): Promise<SetConfigResult> {
  const key = input.key as SettableKey;
  const path = configPathForScope(input.scope);
  const previous = (readScopeConfig(input.scope).config as Record<string, unknown>)[key];

  // `config` is reloaded fresh per invocation by the server, so validation sees any org/project
  // set earlier in this same session.
  const value = await validateValue(key, input.value, config);

  if (!input.confirm) {
    return {
      committed: false,
      key,
      scope: input.scope,
      path,
      previous,
      next: value,
      note:
        `Preview only — nothing written. This will set "${key}" = ${JSON.stringify(value)} in the ` +
        `${input.scope} config (${path})${previous !== undefined ? `, replacing ${JSON.stringify(previous)}` : ''}. ` +
        `Call again with confirm=true to commit.`,
    };
  }

  setConfigKey(path, [key], value);
  return {
    committed: true,
    key,
    scope: input.scope,
    path,
    previous,
    next: value,
    note: `Set "${key}" = ${JSON.stringify(value)} in the ${input.scope} config (${path}).`,
  };
}

/**
 * Validate/coerce a value for a given key, resolving live references to catch typos.
 */
async function validateValue(
  key: string,
  raw: string | boolean,
  config: ImhotepConfig,
): Promise<string | boolean> {
  if (key === 'autonomousMode' || key === 'skillAutoInstall') {
    if (typeof raw !== 'boolean') {
      throw new ImhotepError(`${key} must be a boolean (true/false).`);
    }
    return raw;
  }

  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ImhotepError(`${key} must be a non-empty string.`);
  }
  const value = raw.trim();

  if (key === 'defaultImhotepOrg') {
    // Validate the org authenticates via the sf CLI (catches a bad alias).
    try {
      await getOrgAuth(value);
    } catch (err) {
      throw new ImhotepError(
        `Can't set defaultImhotepOrg="${value}": that org isn't authorized with the \`sf\` CLI ` +
          `(${err instanceof Error ? err.message : String(err)}).`,
      );
    }
    return value;
  }

  // defaultImhotepProject / currentImhotepRelease: verify the record resolves in the default org.
  const objectKey = key === 'defaultImhotepProject' ? 'project' : 'release';
  const obj = config.objects[objectKey];
  if (obj) {
    const resolved = await withConnection(config.defaultImhotepOrg, config.apiVersion, (conn) =>
      resolveOne(conn, obj, value, { org: config.defaultImhotepOrg }),
    );
    if (!resolved.record) {
      throw new ImhotepError(
        `Can't set ${key}="${value}": no matching ${objectKey} found` +
          (resolved.candidates && resolved.candidates.length
            ? ` (did you mean one of ${resolved.candidates.length} candidates?).`
            : '.'),
      );
    }
  }
  return value;
}
