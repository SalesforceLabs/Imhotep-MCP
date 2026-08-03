/*******************************************************************************************
@Name           tools/initConfig
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    imhotep_init_config — scaffold a documented, commented starter imhotep.config.json
                at the chosen scope (the conversational twin of `npx imhotep-mcp init`). No-clobber:
                refuses to overwrite an existing file. Plan §5.2, §7.3.
*******************************************************************************************/

import { z } from 'zod';
import { configPathForScope, writeNewConfigFile } from '../config/write.js';
import { starterConfig } from '../config/scaffold.js';

export const initConfigInputShape = {
  scope: z
    .enum(['project', 'global'])
    .default('project')
    .describe('Where to scaffold: "project" (./imhotep.config.json) or "global" (~/.imhotep).'),
};

export type InitConfigInput = z.infer<z.ZodObject<typeof initConfigInputShape>>;

export interface InitConfigResult {
  created: boolean;
  scope: string;
  path: string;
  note: string;
}

export function initConfig(input: InitConfigInput): InitConfigResult {
  const path = configPathForScope(input.scope);
  const created = writeNewConfigFile(path, starterConfig(input.scope));
  return {
    created,
    scope: input.scope,
    path,
    note: created
      ? `Laid the foundation stones: created a documented starter config at ${path}. Uncomment and set the keys you need.`
      : `A config file already exists at ${path} — left it untouched (no-clobber). Edit it directly, or use set_config to change a value.`,
  };
}
