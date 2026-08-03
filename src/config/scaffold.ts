/*******************************************************************************************
@Name           config/scaffold
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    The documented, commented starter imhotep.config.json emitted by init_config /
                `npx imhotep-mcp init` (plan §7.3, §7.4). Everything is commented out so the file
                is valid-empty-override on creation — the customer uncomments only what they need.
                Comments carry a little ancient-Egypt flavor (safe per §8.1 — human-facing, not
                model context).
*******************************************************************************************/

import type { ConfigScope } from './schema.js';

/**
 * Build a starter config file body for the given scope. Project- vs. global-relevant keys are
 * annotated so the reader knows which scope each typically belongs to (§7.1).
 */
export function starterConfig(scope: Extract<ConfigScope, 'global' | 'project'>): string {
  const where =
    scope === 'global'
      ? 'GLOBAL config (~/.imhotep/config.json) — inherited by every project.'
      : 'PROJECT config (./imhotep.config.json) — overrides your global config for this repo.';

  return `{
  // ─────────────────────────────────────────────────────────────────────────────
  // Imhotep MCP — ${where}
  //
  // "Laying the foundation stones…" — this is a STARTER. Everything is commented
  // out; the server runs on its baked-in managed-package defaults without any of
  // it. Uncomment and set only the keys you need. Precedence (most specific wins):
  //   shipped defaults → global (~/.imhotep) → project (./) → per-call tool args.
  //
  // The namespace is fixed at iab__ in the server and is NOT a config key.
  // Behavioral guidance ("we skip Testing status") belongs in CLAUDE.md, not here.
  // ─────────────────────────────────────────────────────────────────────────────

  // The org where Imhotep is installed (an \`sf\` CLI alias or username).
  // "defaultOrg": "acme-prod",

  // Default OFF. When true, permits unattended (subagent/automation) writes (§6).
  // "autonomousMode": false,

  // Default ON. The server auto-installs/refreshes the shipped skill into
  // ~/.claude/skills/imhotep/ on start. Set false only if you manage that skill yourself.
  // "skillAutoInstall": true,

  // Default WORKING CONTEXT — lets list/create tools assume a project/release when
  // you don't name one. Accepts a name, Id, or record URL.
  // "defaultProject": "GPS Accelerators",   // often GLOBAL (your most-common project)
  // "currentRelease": "R-2026.08",          // usually PROJECT-level; changes as the build advances

  // Custom fields you've ADDED to managed objects, exposed to the AI by logical name:
  // "customFields": {
  //   "story": { "sprint": "Acme_Sprint__c", "riskLevel": "Acme_Risk__c" }
  // },

  // Extra picklist values an admin added (merged with the shipped set):
  // "picklists": {
  //   "story.status": { "add": ["Won't Fix"] }
  // },

  // Preference overrides:
  // "recordTypes": { "story": { "default": "Simple" } },

  // Default related-data pulled when a get_* caller omits \`include\` (§5.4).
  // Only options your installed version ships take effect; a per-call \`include\` still wins.
  // "defaults": {
  //   "getStory":   { "include": ["bodies", "children", "tags"] },
  //   "getRelease": { "include": ["stories"] },
  //   "getProject": { "include": ["releases"] }
  // }
}
`;
}
