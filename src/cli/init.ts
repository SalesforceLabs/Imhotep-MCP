/*******************************************************************************************
@Name           cli/init
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/3/2026
@Description    `npx imhotep-mcp init` — the opt-in scaffold (plan §7.3, §0). Two actions:
                  • CONFIG (yours): writes a documented starter imhotep.config.json (project by
                    default, --global for ~/.imhotep). NO-CLOBBER — never overwrites your config.
                  • SKILL (ours): installs/refreshes the shipped skill into ~/.claude/skills/
                    imhotep/. OVERWRITES — the shipped skill is ours and is kept current (§4.3).
                Console output may carry the ancient-Egypt flavor (§8.1 — human-facing, safe).
*******************************************************************************************/

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPathForScope, writeNewConfigFile } from '../config/write.js';
import { starterConfig } from '../config/scaffold.js';
import { ensureSkillInstalled } from '../skill/install.js';

/** Print the server version for the banner line (best-effort). */
function version(): string {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    return (
      (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: string })
        .version ?? ''
    );
  } catch {
    return '';
  }
}

/**
 * Run `init`. `args` is process.argv after the "init" token. Supports `--global` (scaffold the
 * global ~/.imhotep config; default is project ./imhotep.config.json) and `--no-skill` (skip the
 * skill install). Writes to stdout for humans; exits 0.
 */
export function runInit(args: string[]): void {
  const scope: 'global' | 'project' = args.includes('--global') ? 'global' : 'project';
  const withSkill = !args.includes('--no-skill');

  const out = (s: string) => process.stdout.write(s + '\n');
  out(`𓁿 Imhotep MCP ${version()} — laying the foundation stones…\n`);

  // 1) Config scaffold — YOURS, so NO-CLOBBER (never overwrite an existing config).
  const cfgPath = configPathForScope(scope);
  const created = writeNewConfigFile(cfgPath, starterConfig(scope));
  out(
    created
      ? `  ✔ Created a documented starter ${scope} config: ${cfgPath}`
      : `  • ${scope} config already exists — left untouched: ${cfgPath}`,
  );

  // 2) Skill — OURS, so OVERWRITE (install or refresh to the current shipped version).
  if (withSkill) {
    const skill = ensureSkillInstalled(true);
    out(
      skill.status === 'written'
        ? `  ✔ ${skill.existedBefore ? 'Refreshed' : 'Installed'} the Imhotep skill: ${skill.path}`
        : `  • Skill not installed (${skill.message}): ${skill.path}`,
    );
  }

  out('');
  out('Next steps (in Claude, with the server already registered):');
  out(
    '  1. Set your org:       ask Claude to run imhotep_set_config defaultImhotepOrg <your-sf-org-alias>',
  );
  out('  2. (Optional) project: imhotep_set_config defaultImhotepProject "<your project>"');
  out('  3. Try it:             ask Claude to open a Story, e.g. "show me S000013"');
  out('');
  out('Safe to re-run: your config is never overwritten; the shipped skill is refreshed to the');
  out('current version (put your own customizations in a separate "imhotep-custom" skill).');
}
