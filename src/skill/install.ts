/*******************************************************************************************
@Name           skill/install
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/3/2026
@Description    Install/refresh the SHIPPED Imhotep skill into ~/.claude/skills/imhotep/. The
                shipped skill is OURS: it is force-present and OVERWRITTEN on install, update, and
                server start so customers always get the current version (plan §4.2/§4.3, §7.3).
                Customer customizations belong in a separate ~/.claude/skills/imhotep-custom/ skill
                and in imhotep.config.json — neither of which this ever touches.

                Guarantees:
                - **Best-effort, never fatal:** the skill is NOT required for the MCP tools to work
                  in any client (it's a Claude-specific judgment layer). A write failure never
                  gates the server — it warns on stderr and carries on.
                - **stderr only:** status/warnings go to stderr; stdout is the MCP protocol stream.
                - **Opt-out:** honors config `skillAutoInstall` (default true) so a user who manages
                  the skill themselves can disable the auto-write.
*******************************************************************************************/

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the shipped skill source inside the package. */
function shippedSkillPath(): string {
  // dist/skill/install.js → package root is two levels up; skill/SKILL.md ships at the root.
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skill', 'SKILL.md');
}

/** The install destination for the shipped skill. */
export function installedSkillDir(): string {
  return join(homedir(), '.claude', 'skills', 'imhotep');
}
export function installedSkillPath(): string {
  return join(installedSkillDir(), 'SKILL.md');
}

export interface SkillInstallResult {
  /** 'written' = installed/refreshed; 'skipped' = disabled by config; 'failed' = write error. */
  status: 'written' | 'skipped' | 'failed';
  path: string;
  /** True if a skill already existed at the destination before this call. */
  existedBefore: boolean;
  message: string;
}

/**
 * Ensure the shipped skill is present and current at ~/.claude/skills/imhotep/SKILL.md.
 * OVERWRITES unconditionally (the shipped skill is ours). Best-effort: returns a result rather
 * than throwing, so callers (server startup especially) never fail because of it.
 *
 * @param autoInstall  config `skillAutoInstall` (default true). When false, does nothing.
 */
export function ensureSkillInstalled(autoInstall = true): SkillInstallResult {
  const dest = installedSkillPath();
  const existedBefore = existsSync(dest);

  if (!autoInstall) {
    return {
      status: 'skipped',
      path: dest,
      existedBefore,
      message: 'skillAutoInstall is off — leaving the skill as-is.',
    };
  }

  try {
    const src = shippedSkillPath();
    const content = readFileSync(src, 'utf8');
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, 'utf8');
    return {
      status: 'written',
      path: dest,
      existedBefore,
      message: existedBefore
        ? `Refreshed the Imhotep skill at ${dest}.`
        : `Installed the Imhotep skill at ${dest}.`,
    };
  } catch (err) {
    return {
      status: 'failed',
      path: dest,
      existedBefore,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Emit a stderr message about a skill-install result, escalating when NO skill is present
 * (the genuinely-degraded state: MCP tools work, but the assistant lacks guidance). Never writes
 * to stdout (that's the MCP protocol stream), never throws. For use at server startup.
 */
export function reportSkillInstall(result: SkillInstallResult): void {
  if (result.status === 'written' || result.status === 'skipped') return; // quiet on success/skip
  // status === 'failed'
  if (result.existedBefore) {
    process.stderr.write(
      `Imhotep MCP: couldn't refresh the skill (${result.message}); the existing one at ` +
        `${result.path} still applies.\n`,
    );
  } else {
    process.stderr.write(
      `Imhotep MCP: the tools are available, but the Imhotep skill could not be installed at ` +
        `${result.path} (${result.message}). Your assistant may not know how to use the tools ` +
        `well. Fix: run \`npx imhotep-mcp init\`, or copy the package's skill/SKILL.md there ` +
        `manually.\n`,
    );
  }
}
