/*******************************************************************************************
@Name           config/write
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Writing side of the customer config files (plan §7). Resolves the write target
                for the global (~/.imhotep) and project (./imhotep.config.json) scopes, applies a
                single-key edit while PRESERVING comments (jsonc-parser modify/applyEdits),
                auto-creates a missing file, and writes atomically (temp file + rename). The
                SERVER does this I/O — never the agent's tool layer (§7.1).
*******************************************************************************************/

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { modify, applyEdits } from 'jsonc-parser';
import type { ConfigScope } from './schema.js';
import { resolveGlobalConfigPath, projectConfigPath } from './load.js';

/** The default global config path for WRITES (honors IMHOTEP_CONFIG / XDG, else ~/.imhotep). */
export function globalConfigWritePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.IMHOTEP_CONFIG?.trim();
  if (explicit) return explicit;
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) return join(xdg, 'imhotep', 'config.json');
  return join(homedir(), '.imhotep', 'config.json');
}

/**
 * Resolve the file path for a writable scope. `global` uses an existing global file if the
 * lookup finds one, else the default write path; `project` is always ./imhotep.config.json.
 */
export function configPathForScope(
  scope: 'global' | 'project',
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  const env = opts.env ?? process.env;
  if (scope === 'project') return projectConfigPath(opts.cwd ?? process.cwd());
  return resolveGlobalConfigPath(env) ?? globalConfigWritePath(env);
}

/** Write `content` to `path` atomically (temp file + rename), creating parent dirs. */
function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

/**
 * Set a single top-level key in the config file at `path`, preserving existing comments and
 * formatting. Creates the file (as `{}` then the key) if absent. Returns the new file text.
 * `keyPath` is a jsonc-parser path array, e.g. ["defaultOrg"] or ["defaults","getStory","include"].
 */
export function setConfigKey(path: string, keyPath: (string | number)[], value: unknown): string {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '{}\n';
  const edits = modify(existing, keyPath, value, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  const updated = applyEdits(existing, edits);
  atomicWrite(path, updated.endsWith('\n') ? updated : `${updated}\n`);
  return updated;
}

/**
 * Write a brand-new config file with the given content, refusing to overwrite an existing file
 * (no-clobber — for init/scaffold, §7.3). Returns true if written, false if the file already
 * existed.
 */
export function writeNewConfigFile(path: string, content: string): boolean {
  if (existsSync(path)) return false;
  atomicWrite(path, content);
  return true;
}

/** True if a config file exists at the given scope. */
export function configExistsAtScope(
  scope: 'global' | 'project',
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): boolean {
  return existsSync(configPathForScope(scope, opts));
}

/** Re-export the scope type for tool convenience. */
export type WritableScope = Extract<ConfigScope, 'global' | 'project'>;
