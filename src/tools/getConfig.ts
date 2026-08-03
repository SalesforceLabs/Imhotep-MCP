/*******************************************************************************************
@Name           tools/getConfig
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_get_config — show current settings: the merged EFFECTIVE config
                (default → global → project), or a specific scope's raw contents. Read-only.
                Redacts nothing sensitive (config holds org aliases + field maps, not secrets).
                Plan §5.2, §7.1.
*******************************************************************************************/

import { z } from 'zod';
import type { ImhotepConfig } from '../config/schema.js';
import { loadConfig, readScopeConfig } from '../config/load.js';

export const getConfigInputShape = {
  scope: z
    .enum(['effective', 'default', 'global', 'project'])
    .default('effective')
    .describe(
      'Which config to show: "effective" (merged default→global→project, the default), or a ' +
        'single scope\'s raw contents ("default", "global", "project").',
    ),
};

export type GetConfigInput = z.infer<z.ZodObject<typeof getConfigInputShape>>;

export interface GetConfigResult {
  scope: string;
  /** File path this scope reads from (null if no file exists at that scope). */
  path: string | null;
  config: Partial<ImhotepConfig>;
  /** For "effective": where each scope resolved from, for transparency. */
  sources?: { default: string; global: string | null; project: string | null };
}

// `config` is loaded per-process at startup; get_config re-reads from disk so it reflects any
// out-of-band edits (hand-editing or a prior set_config in the same session).
export function getConfig(input: GetConfigInput): GetConfigResult {
  if (input.scope === 'effective') {
    const { config, sources } = loadConfig();
    return { scope: 'effective', path: null, config, sources };
  }
  const { path, config } = readScopeConfig(input.scope);
  return { scope: input.scope, path, config };
}
