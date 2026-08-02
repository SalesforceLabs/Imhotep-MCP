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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import { loadConfig } from './config/load.js';
import type { ImhotepConfig } from './config/schema.js';
import { ImhotepError } from './salesforce/errors.js';
import { getStory, getStoryInputShape } from './tools/getStory.js';
import { getProject, getProjectInputShape } from './tools/getProject.js';
import { getRelease, getReleaseInputShape } from './tools/getRelease.js';
import { listProjects, listProjectsInputShape } from './tools/listProjects.js';
import { listReleases, listReleasesInputShape } from './tools/listReleases.js';
import { listStories, listStoriesInputShape } from './tools/listStories.js';
import { search, searchInputShape } from './tools/search.js';

/** Package version, kept in sync with package.json manually (bumped at release). */
const SERVER_VERSION = '0.1.0';

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
  const { config, sources } = loadConfig();
  printBanner(config.apiVersion, sources);

  const server = new McpServer({ name: 'imhotep-mcp', version: SERVER_VERSION });

  /**
   * Register a tool: wrap its handler with uniform structured-output + error handling.
   * `handler` takes the validated args + the effective config and returns a plain result object.
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `Imhotep MCP failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
