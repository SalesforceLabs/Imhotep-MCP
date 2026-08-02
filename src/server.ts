#!/usr/bin/env node
/*******************************************************************************************
@Name           server
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Imhotep MCP server entry point. A stdio MCP server that loads the effective
                configuration, registers the Imhotep tools, and speaks MCP over stdin/stdout
                (plan §2 local stdio, $0 hosting). Increment 1 registers imhotep_get_story to
                prove the pipeline end-to-end.
*******************************************************************************************/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config/load.js';
import { getStory, getStoryInputShape, type GetStoryInput } from './tools/getStory.js';
import { ImhotepError } from './salesforce/errors.js';

/** Package version, kept in sync with package.json manually (bumped at release). */
const SERVER_VERSION = '0.1.0';

/** A themed one-line startup banner on stderr — humans see it, the model doesn't (§8.1). */
function printBanner(apiVersion: string, sources: { global: string | null; project: string | null }): void {
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

  const server = new McpServer({
    name: 'imhotep-mcp',
    version: SERVER_VERSION,
  });

  server.registerTool(
    'imhotep_get_story',
    {
      title: 'Get Imhotep Story',
      description:
        'Open one Imhotep Story with its core fields. Accepts a Story number (e.g. "528", ' +
        '"S-528", "S000528"), an 18/15-char Salesforce Id, a pasted record URL, or a Title ' +
        'fragment. On an ambiguous or missing reference, returns candidate Stories to choose ' +
        'from rather than an error.',
      inputSchema: getStoryInputShape,
    },
    async (args) => {
      try {
        const result = await getStory(args as GetStoryInput, config);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof ImhotepError ? err.message : String(err);
        return {
          content: [{ type: 'text', text: message }],
          isError: true,
        };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Imhotep MCP failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
