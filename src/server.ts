#!/usr/bin/env node
/*******************************************************************************************
@Name           server
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Imhotep MCP server entry point. A stdio MCP server that loads the effective
                configuration, registers the Imhotep tools, and speaks MCP over stdin/stdout
                (plan §2 local stdio, $0 hosting). v1 read/navigation surface: list/get across
                Projects, Releases, Stories, plus search.
*******************************************************************************************/

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import { loadConfig } from './config/load.js';
import type { ImhotepConfig } from './config/schema.js';
import { ImhotepError } from './salesforce/errors.js';
import { ensureSkillInstalled, reportSkillInstall } from './skill/install.js';
import { getStory, getStoryInputShape } from './tools/getStory.js';
import { getProject, getProjectInputShape } from './tools/getProject.js';
import { getRelease, getReleaseInputShape } from './tools/getRelease.js';
import { listProjects, listProjectsInputShape } from './tools/listProjects.js';
import { listReleases, listReleasesInputShape } from './tools/listReleases.js';
import { listStories, listStoriesInputShape } from './tools/listStories.js';
import { search, searchInputShape } from './tools/search.js';
import { createStory, createStoryInputShape } from './tools/createStory.js';
import { updateStory, updateStoryInputShape } from './tools/updateStory.js';
import { transferStory, transferStoryInputShape } from './tools/transferStory.js';
import { updateRelease, updateReleaseInputShape } from './tools/updateRelease.js';
import { getConfig, getConfigInputShape } from './tools/getConfig.js';
import { setConfig, setConfigInputShape } from './tools/setConfig.js';
import { initConfig, initConfigInputShape } from './tools/initConfig.js';

/** The server version, read from the package's own package.json (single source of truth). */
function readServerVersion(): string {
  try {
    // dist/server.js → package root is one level up.
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
const SERVER_VERSION = readServerVersion();

/** A themed one-line startup banner on stderr — humans see it, the model doesn't (§8.1). */
function printBanner(
  apiVersion: string,
  sources: { global: string | null; project: string | null },
): void {
  const scopes = ['defaults', sources.global && 'global', sources.project && 'project']
    .filter(Boolean)
    .join(' + ');
  process.stderr.write(
    `𓁿 Imhotep MCP v${SERVER_VERSION} — laying the foundation stones… ` +
      `(API v${apiVersion}; config: ${scopes})\n`,
  );
}

async function main(): Promise<void> {
  // CLI subcommands (e.g. `npx imhotep-mcp init`) run instead of starting the MCP server.
  // The default (no subcommand) is the stdio MCP server an MCP client launches.
  const subcommand = process.argv[2];
  if (subcommand === 'init') {
    const { runInit } = await import('./cli/init.js');
    runInit(process.argv.slice(3));
    return;
  }

  const startup = loadConfig();
  printBanner(startup.config.apiVersion, startup.sources);

  // Ensure the shipped skill is present/current (§4.3). Best-effort: this NEVER gates the server —
  // the tools work in any MCP client without the skill; a write failure only warns on stderr
  // (louder when no skill exists at all). Honors config `skillAutoInstall` (default true).
  reportSkillInstall(ensureSkillInstalled(startup.config.skillAutoInstall ?? true));

  const server = new McpServer({ name: 'imhotep-mcp', version: SERVER_VERSION });

  /**
   * Register a tool: wrap its handler with uniform structured-output + error handling.
   * `handler` takes the validated args + the effective config and returns a plain result object.
   * Config is reloaded FRESH per invocation (files are tiny, local) so every call sees current
   * settings — including a `set_config` change or hand-edit made earlier in the same session.
   */
  function tool<Shape extends ZodRawShape>(
    name: string,
    title: string,
    description: string,
    inputSchema: Shape,
    handler: (args: Record<string, unknown>, config: ImhotepConfig) => Promise<unknown>,
  ): void {
    const callback = async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const config = loadConfig().config;
        // Apply org-resolution precedence centrally (§5.5): per-call `org` → config
        // defaultImhotepOrg → CLI default. Tools then just read args.org and never see the plumbing.
        if ((args.org === undefined || args.org === '') && config.defaultImhotepOrg) {
          args = { ...args, org: config.defaultImhotepOrg };
        }
        const result = await handler(args, config);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof ImhotepError ? err.message : String(err);
        return { content: [{ type: 'text', text: message }], isError: true };
      }
    };
    server.registerTool(name, { title, description, inputSchema }, callback as never);
  }

  tool(
    'imhotep_list_projects',
    'List Imhotep Projects',
    'Locate or enumerate Imhotep Projects by name fragment and/or status (Planning/Active/' +
      'Completed). A pasted Id or record URL fetches that Project directly. The Project is the top ' +
      'of the hierarchy — most work starts here.',
    listProjectsInputShape,
    (args, config) => listProjects(args as never, config),
  );

  tool(
    'imhotep_get_project',
    'Get Imhotep Project',
    'Open one Imhotep Project (core fields + point/count rollups). Accepts a name fragment, Id, ' +
      'or record URL. Use `include` to also pull "releases" and/or "resources" (Resource Links).',
    getProjectInputShape,
    (args, config) => getProject(args as never, config),
  );

  tool(
    'imhotep_list_releases',
    'List Imhotep Releases',
    "List a Project's Releases (points goal/remaining, dates, backlog flag). Filter by status or " +
      'set is_backlog=true for the backlog Release(s). The Project accepts a name, Id, or URL.',
    listReleasesInputShape,
    (args, config) => listReleases(args as never, config),
  );

  tool(
    'imhotep_get_release',
    'Get Imhotep Release',
    'Open one Imhotep Release (fields, points rollups, Release Notes as Markdown). Accepts a ' +
      'name fragment, Id, or record URL. Use `include: ["stories"]` to also pull its Stories.',
    getReleaseInputShape,
    (args, config) => getRelease(args as never, config),
  );

  tool(
    'imhotep_get_story',
    'Get Imhotep Story',
    'Open one Imhotep Story. Accepts a Story number (e.g. "528", "S-528", "S000528"), an 18/15-' +
      'char Salesforce Id, a pasted record URL, or a Title fragment. Use `include` for "bodies" ' +
      '(rich-text as Markdown), "children" (child Stories), and "tags" (all on by default). On an ' +
      'ambiguous or missing reference, returns candidate Stories rather than an error.',
    getStoryInputShape,
    (args, config) => getStory(args as never, config),
  );

  tool(
    'imhotep_list_stories',
    'List Imhotep Stories',
    'The workhorse Story list ("what\'s in flight", "stories in release X"). Filters (release, ' +
      'project, status, type, assigned_to, parent_story, tag) are AND-combined; results are skinny ' +
      '(no rich-text bodies), ordered by priority then Story number. release/project/parent_story ' +
      'accept a name, number, Id, or URL.',
    listStoriesInputShape,
    (args, config) => listStories(args as never, config),
  );

  tool(
    'imhotep_search',
    'Search Imhotep records',
    'Free-text search across an object\'s Name and body fields when you have no number or exact ' +
      'name. Choose object = Story (default), Project, or Release. Returns skinny matches to pick ' +
      'from.',
    searchInputShape,
    (args, config) => search(args as never, config),
  );

  // --- Write tools (§5.2). These modify Salesforce data; the skill enforces confirm-before-
  // write, and the server carries the autonomousMode posture (§6). ---

  tool(
    'imhotep_create_story',
    'Create Imhotep Story',
    'Create a Story under a Release. The Project is derived automatically from the Release (you ' +
      'do not pass it). Set parent_story to create a child Story. Rich-text fields (description, ' +
      'acceptance_criteria, build_notes, deployment_checklist) are authored in Markdown. Returns ' +
      'the new Story (with its SNNNNNN number). Preview the payload + target org and get user ' +
      'approval before calling.',
    createStoryInputShape,
    (args, config) => createStory(args as never, config),
  );

  tool(
    'imhotep_update_story',
    'Update Imhotep Story',
    'Update one or more writable fields on a Story, including status (e.g. "mark S-528 Ready"). ' +
      'Rich-text fields are authored in Markdown. System-maintained fields are refused. Preview ' +
      'the change + target org and get user approval before calling.',
    updateStoryInputShape,
    (args, config) => updateStory(args as never, config),
  );

  tool(
    'imhotep_transfer_story',
    'Transfer Imhotep Story to another Release',
    "Move a Story to another Release. The Story's Project is kept consistent automatically " +
      '(re-pointed to the destination Release\'s Project). "Move to backlog" = transfer to the ' +
      'backlog Release. Preview + get user approval before calling.',
    transferStoryInputShape,
    (args, config) => transferStory(args as never, config),
  );

  tool(
    'imhotep_update_release',
    'Update Imhotep Release',
    'Update writable Release fields (status, dates, points goal, backlog flag, description, and ' +
      'Release Notes — Markdown → HTML). System-maintained rollup fields are refused. Preview + ' +
      'get user approval before calling.',
    updateReleaseInputShape,
    (args, config) => updateRelease(args as never, config),
  );

  // --- Config-management tools (§5.2, §7). The SERVER performs the file I/O; the agent just
  // calls a verb, needing no filesystem access to ~/.imhotep. ---

  tool(
    'imhotep_get_config',
    'Get Imhotep config',
    'Show current Imhotep MCP settings: the merged effective config (default → global → project) ' +
      'or a single scope\'s raw contents ("default", "global", "project"). Read-only.',
    getConfigInputShape,
    async (args) => getConfig(args as never),
  );

  tool(
    'imhotep_set_config',
    'Set an Imhotep config value',
    'Change a setting (defaultImhotepOrg, defaultImhotepProject, currentImhotepRelease, autonomousMode) at the global ' +
      'or project scope. Two-step: called without confirm=true it validates the value (resolving ' +
      'the org/project/release live) and returns a preview WITHOUT writing; call again with ' +
      'confirm=true to commit. Preview the change and get user approval before confirming.',
    setConfigInputShape,
    (args, config) => setConfig(args as never, config),
  );

  tool(
    'imhotep_init_config',
    'Initialize an Imhotep config file',
    'Scaffold a documented, commented starter imhotep.config.json at the "project" or "global" ' +
      'scope. No-clobber: refuses to overwrite an existing file.',
    initConfigInputShape,
    async (args) => initConfig(args as never),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `Imhotep MCP failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
