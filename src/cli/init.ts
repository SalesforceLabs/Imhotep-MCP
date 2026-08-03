/*******************************************************************************************
@Name           cli/init
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/3/2026
@Description    `npx imhotep-mcp init` — the one-time, opt-in scaffold (plan §7.3, §0). Writes a
                documented starter imhotep.config.json (project-level by default, --global for
                ~/.imhotep) and installs the shipped skill into ~/.claude/skills/imhotep/. Both
                are NO-CLOBBER (never overwrite existing files) so it's safe to run and re-run.
                Console output may carry the ancient-Egypt flavor (§8.1 — human-facing, safe).
*******************************************************************************************/

import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPathForScope, writeNewConfigFile } from '../config/write.js';
import { starterConfig } from '../config/scaffold.js';

/** Resolve the package root (dist/cli/init.js → two levels up). */
function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** Install the shipped skill into ~/.claude/skills/imhotep/ (no-clobber). Returns a status. */
function installSkill(): { installed: boolean; path: string; reason?: string } {
  const src = join(packageRoot(), 'skill', 'SKILL.md');
  const destDir = join(homedir(), '.claude', 'skills', 'imhotep');
  const dest = join(destDir, 'SKILL.md');
  if (!existsSync(src)) {
    return { installed: false, path: dest, reason: 'shipped skill not found in package' };
  }
  if (existsSync(dest)) {
    return { installed: false, path: dest, reason: 'a skill already exists there (left untouched)' };
  }
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  return { installed: true, path: dest };
}

/** Print the server version for the banner line (best-effort). */
function version(): string {
  try {
    return (JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')) as { version?: string })
      .version ?? '';
  } catch {
    return '';
  }
}

/**
 * Run `init`. `args` is process.argv after the "init" token. Supports `--global` (scaffold the
 * global ~/.imhotep config; default is project ./imhotep.config.json) and `--no-skill` (skip
 * installing the skill). Writes to stderr/stdout for humans; exits 0.
 */
export function runInit(args: string[]): void {
  const scope: 'global' | 'project' = args.includes('--global') ? 'global' : 'project';
  const withSkill = !args.includes('--no-skill');

  const out = (s: string) => process.stdout.write(s + '\n');
  out(`𓁿 Imhotep MCP ${version()} — laying the foundation stones…\n`);

  // 1) Config scaffold (no-clobber).
  const cfgPath = configPathForScope(scope);
  const created = writeNewConfigFile(cfgPath, starterConfig(scope));
  out(
    created
      ? `  ✔ Created a documented starter ${scope} config: ${cfgPath}`
      : `  • ${scope} config already exists (left untouched): ${cfgPath}`,
  );

  // 2) Skill install (no-clobber).
  if (withSkill) {
    const skill = installSkill();
    out(
      skill.installed
        ? `  ✔ Installed the Imhotep skill: ${skill.path}`
        : `  • Skill not installed — ${skill.reason}: ${skill.path}`,
    );
  }

  out('');
  out('Next steps:');
  out('  1. Set your org:      ask Claude to run imhotep_set_config defaultOrg <your-sf-org-alias>');
  out('  2. (Optional) project: imhotep_set_config defaultProject "<your project>"');
  out('  3. Register the server with your MCP client (see the README).');
  out('');
  out('Re-running init is safe — it never overwrites your existing config or skill.');
}
