/*******************************************************************************************
@Name           salesforce/auth
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Bootstrap authentication by shelling out to the user's installed `sf` CLI:
                `sf org auth show-access-token` yields the live access token, and
                `sf org display` yields the instance URL + username. This is the CLI's ONLY
                role — every data call then runs as that user under their Salesforce
                permissions (plan §0, §6). Tokens are never printed or persisted.

                WHY show-access-token (and why that's OK for an AI-invoked tool) — re: sf CLI
                issue forcedotcom/cli#3560:
                  • Current `sf` versions MASK the token in `org display` output
                    ("[REDACTED] Use 'sf org auth show-access-token' to view"), so the token
                    MUST come from the dedicated `show-access-token` command. #3560 documents
                    `sf org auth show-access-token --json` as the sanctioned programmatic
                    replacement — this is that usage.
                  • #3560 recommends prohibiting `sf org auth show-*` from an *AI coding
                    agent's* command permissions, because a token in an agent's command output
                    lands in the model's context/transcript/logs. That warning targets the
                    agent running the command directly. Here the command runs INSIDE this
                    server process: the token is held in memory only, passed straight to the
                    jsforce connection, and NEVER returned to the model, written to the MCP
                    transcript, or logged (banner/error messages carry no token). Same
                    containment model as the CLI itself or an OAuth integration holding a
                    credential. Keep it that way — do not add the token to any tool result,
                    error message, or stderr line.
                  • Longer-term auth model (connected-app OAuth vs. CLI-token extraction) is an
                    open design question flagged for Increment 6 — see plan §6.
*******************************************************************************************/

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** The auth material needed to open a jsforce connection as the running user. */
export interface OrgAuth {
  accessToken: string;
  instanceUrl: string;
  /** The username the token belongs to (for diagnostics; never the token itself). */
  username: string;
  /** The org alias/username we resolved against (as passed to `sf`). */
  target: string;
}

/** Raised when `sf` auth fails; message is safe to surface (no token content). */
export class SfCliAuthError extends Error {
  constructor(
    message: string,
    readonly target: string | undefined,
  ) {
    super(message);
    this.name = 'SfCliAuthError';
  }
}

/** Minimal shape of an `sf … --json` envelope. */
interface SfJsonEnvelope<T> {
  status: number;
  result?: T;
  message?: string;
  name?: string;
}

/**
 * Run an `sf` command with `--json` (+ optional `--target-org`) and return the parsed
 * envelope. Throws SfCliAuthError with a plain-language message on failure. `sf` prints JSON
 * to stdout even on many error exits, so we parse stdout in the catch too for a better message.
 */
async function runSfJson<T>(
  subcommand: string[],
  target: string | undefined,
): Promise<SfJsonEnvelope<T>> {
  const args = [...subcommand, '--json'];
  if (target) args.push('--target-org', target);

  let stdout: string;
  try {
    const result = await execFileAsync('sf', args, { maxBuffer: 10 * 1024 * 1024 });
    stdout = result.stdout;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const parsed = safeParse<T>(e.stdout);
    const detail =
      parsed?.message ??
      e.stderr?.trim() ??
      e.message ??
      `unknown error running \`sf ${subcommand.join(' ')}\``;
    throw new SfCliAuthError(
      `Could not authenticate with the Salesforce CLI${target ? ` for org "${target}"` : ''}: ${detail}. ` +
        `Make sure the \`sf\` CLI is installed and you have authorized the org (\`sf org login web\`).`,
      target,
    );
  }

  const parsed = safeParse<T>(stdout);
  if (!parsed || parsed.status !== 0 || parsed.result === undefined) {
    throw new SfCliAuthError(
      `The Salesforce CLI returned an unexpected response${target ? ` for org "${target}"` : ''}: ${
        parsed?.message ?? 'no result payload'
      }.`,
      target,
    );
  }
  return parsed;
}

/**
 * Fetch a live access token + instance URL for the given org via the `sf` CLI.
 * The token comes from `sf org auth show-access-token` (the `org display` token is masked);
 * the instance URL + username come from `sf org display`. If `target` is omitted, the CLI
 * uses its configured default org.
 */
export async function getOrgAuth(target?: string): Promise<OrgAuth> {
  const [tokenEnv, displayEnv] = await Promise.all([
    runSfJson<{ accessToken?: string }>(['org', 'auth', 'show-access-token'], target),
    runSfJson<{ instanceUrl?: string; username?: string }>(['org', 'display'], target),
  ]);

  const accessToken = tokenEnv.result?.accessToken;
  const instanceUrl = displayEnv.result?.instanceUrl;
  const username = displayEnv.result?.username;

  if (!accessToken) {
    throw new SfCliAuthError(
      `The Salesforce CLI did not return an access token${target ? ` for org "${target}"` : ''}. ` +
        `Try re-authorizing with \`sf org login web\`.`,
      target,
    );
  }
  if (!instanceUrl) {
    throw new SfCliAuthError(
      `The Salesforce CLI did not return an instance URL${target ? ` for org "${target}"` : ''}. ` +
        `Try re-authorizing with \`sf org login web\`.`,
      target,
    );
  }

  return {
    accessToken,
    instanceUrl,
    username: username ?? '(unknown)',
    target: target ?? '(default)',
  };
}

function safeParse<T>(text: string | undefined): SfJsonEnvelope<T> | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as SfJsonEnvelope<T>;
  } catch {
    return null;
  }
}
