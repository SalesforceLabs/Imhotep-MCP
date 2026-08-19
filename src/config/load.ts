/*******************************************************************************************
@Name           config/load
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Loads and deep-merges the Imhotep MCP configuration: shipped defaults →
                global (~/.imhotep) → project (./imhotep.config.json), most-specific wins.
                Tolerant of JSONC (comments) via jsonc-parser. See plan §7.1.
*******************************************************************************************/

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseJsonc, type ParseError } from 'jsonc-parser';
import type { ImhotepConfig } from './schema.js';

/** Absolute path to the shipped config.default.json (repo root / package root). */
function shippedDefaultPath(): string {
  // This module compiles to dist/config/load.js; the default lives at the package root.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'config.default.json');
}

/**
 * Resolve the global config path, honoring (in order):
 *   1. IMHOTEP_CONFIG env var (explicit path)
 *   2. $XDG_CONFIG_HOME/imhotep/config.json
 *   3. ~/.imhotep/config.json
 * Returns the first path that exists, or null if none do. (Plan §7.1.)
 */
export function resolveGlobalConfigPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.IMHOTEP_CONFIG?.trim();
  if (explicit) return existsSync(explicit) ? explicit : null;

  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) {
    const xdgPath = join(xdg, 'imhotep', 'config.json');
    if (existsSync(xdgPath)) return xdgPath;
  }

  const homePath = join(homedir(), '.imhotep', 'config.json');
  return existsSync(homePath) ? homePath : null;
}

/** The project-scope config path for a given working directory. */
export function projectConfigPath(cwd: string = process.cwd()): string {
  return join(cwd, 'imhotep.config.json');
}

/**
 * Parse a JSONC file into a partial config object; throws with a clear message on syntax error.
 */
export function readConfigFile(path: string): Partial<ImhotepConfig> {
  const raw = readFileSync(path, 'utf8');
  const errors: ParseError[] = [];
  const parsed = parseJsonc(raw, errors, { allowTrailingComma: true }) as
    Partial<ImhotepConfig> | undefined;
  if (errors.length > 0) {
    throw new Error(
      `Invalid JSON in config file ${path} (${errors.length} parse error(s)). Check for a stray comma or bracket.`,
    );
  }
  return parsed ?? {};
}

/** True for a plain object we should recurse into (not an array, null, or class instance). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge `source` over `target`, most-specific-wins. Objects merge recursively;
 * arrays and scalars are replaced wholesale by the source value. Returns a new object.
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return (source as T) ?? target;
  }
  const out: Record<string, unknown> = { ...target };
  for (const [key, srcVal] of Object.entries(source)) {
    if (srcVal === undefined) continue;
    const tgtVal = out[key];
    out[key] = isPlainObject(tgtVal) && isPlainObject(srcVal) ? deepMerge(tgtVal, srcVal) : srcVal;
  }
  return out as T;
}

/** Result of loading config, with provenance for diagnostics / get_config. */
export interface LoadedConfig {
  config: ImhotepConfig;
  sources: {
    default: string;
    global: string | null;
    project: string | null;
  };
}

/**
 * Load the effective configuration by deep-merging:
 *   shipped defaults → global override → project override (most specific wins).
 * (Plan §7.1 precedence; per-call tool arguments are applied later, by the tools.)
 */
export function loadConfig(options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): LoadedConfig {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  const defaultPath = shippedDefaultPath();
  let config = readConfigFile(defaultPath) as ImhotepConfig;

  const globalPath = resolveGlobalConfigPath(env);
  if (globalPath) {
    config = deepMerge(config, readConfigFile(globalPath));
  }

  const projPath = projectConfigPath(cwd);
  const projectPath = existsSync(projPath) ? projPath : null;
  if (projectPath) {
    config = deepMerge(config, readConfigFile(projectPath));
  }

  return {
    config,
    sources: { default: defaultPath, global: globalPath, project: projectPath },
  };
}

/**
 * Read the RAW (unmerged) config for a single scope, for `get_config(scope)`. Returns the parsed
 * object and the resolved path (or null path + {} when no file exists at that scope).
 */
export function readScopeConfig(
  scope: 'default' | 'global' | 'project',
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): { path: string | null; config: Partial<ImhotepConfig> } {
  const env = options.env ?? process.env;
  if (scope === 'default') {
    const path = shippedDefaultPath();
    return { path, config: readConfigFile(path) };
  }
  if (scope === 'global') {
    const path = resolveGlobalConfigPath(env);
    return { path, config: path ? readConfigFile(path) : {} };
  }
  const projPath = projectConfigPath(options.cwd ?? process.cwd());
  const path = existsSync(projPath) ? projPath : null;
  return { path, config: path ? readConfigFile(path) : {} };
}
