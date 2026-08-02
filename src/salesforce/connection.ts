/*******************************************************************************************
@Name           salesforce/connection
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    jsforce Connection factory + per-org session cache for the Imhotep MCP server.
                Discovers the org's max API version and caps the shipped default to it; on an
                expired session (INVALID_SESSION_ID) it re-shells `sf` once for a fresh token
                and retries. All data calls run as the authenticated user (plan §0, §6).
*******************************************************************************************/

import jsforce from 'jsforce';
import { getOrgAuth, type OrgAuth } from './auth.js';

/** A ready-to-use connection plus the resolved API version and auth metadata. */
export interface OrgConnection {
  conn: jsforce.Connection;
  apiVersion: string;
  auth: OrgAuth;
}

/** Cache key = resolved org target (alias/username or "(default)"). */
const connectionCache = new Map<string, OrgConnection>();

/**
 * Discover the org's maximum supported API version via the unauthenticated
 * `/services/data/` resource, and return min(preferred, orgMax) as a "XX.0" string.
 * Falls back to `preferred` if discovery fails for any reason (never blocks a call).
 */
export async function resolveApiVersion(
  instanceUrl: string,
  preferred: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  try {
    const res = await fetchImpl(`${instanceUrl.replace(/\/$/, '')}/services/data/`);
    if (!res.ok) return preferred;
    const versions = (await res.json()) as Array<{ version?: string }>;
    const max = versions
      .map((v) => Number.parseFloat(v.version ?? ''))
      .filter((n) => !Number.isNaN(n))
      .reduce((a, b) => Math.max(a, b), 0);
    if (max === 0) return preferred;
    const preferredNum = Number.parseFloat(preferred);
    const capped = Number.isNaN(preferredNum) ? max : Math.min(preferredNum, max);
    return capped.toFixed(1);
  } catch {
    return preferred;
  }
}

/** Build a fresh connection (auth + version resolution) and cache it under `target`. */
async function openConnection(
  target: string | undefined,
  preferredApiVersion: string,
): Promise<OrgConnection> {
  const auth = await getOrgAuth(target);
  const apiVersion = await resolveApiVersion(auth.instanceUrl, preferredApiVersion);
  const conn = new jsforce.Connection({
    instanceUrl: auth.instanceUrl,
    accessToken: auth.accessToken,
    version: apiVersion,
  });
  const orgConn: OrgConnection = { conn, apiVersion, auth };
  connectionCache.set(target ?? '(default)', orgConn);
  return orgConn;
}

/**
 * Get a connection for the resolved org, reusing a cached one if present.
 * `preferredApiVersion` (the shipped default) is capped to the org's max on first open.
 */
export async function getConnection(
  target: string | undefined,
  preferredApiVersion: string,
): Promise<OrgConnection> {
  const key = target ?? '(default)';
  const cached = connectionCache.get(key);
  if (cached) return cached;
  return openConnection(target, preferredApiVersion);
}

/** True if an error looks like an expired/invalid Salesforce session. */
function isSessionExpired(err: unknown): boolean {
  const e = err as { errorCode?: string; name?: string; message?: string };
  const code = e?.errorCode ?? e?.name ?? '';
  const msg = e?.message ?? '';
  return code === 'INVALID_SESSION_ID' || /INVALID_SESSION_ID/i.test(msg);
}

/**
 * Run a data operation against the org, transparently refreshing the session once if it
 * has expired. The `sf` CLI auto-refreshes tokens, so re-shelling yields a fresh one
 * (plan §0 session-expiry handling).
 */
export async function withConnection<T>(
  target: string | undefined,
  preferredApiVersion: string,
  op: (conn: jsforce.Connection) => Promise<T>,
): Promise<T> {
  const key = target ?? '(default)';
  const orgConn = await getConnection(target, preferredApiVersion);
  try {
    return await op(orgConn.conn);
  } catch (err) {
    if (!isSessionExpired(err)) throw err;
    connectionCache.delete(key);
    const fresh = await openConnection(target, preferredApiVersion);
    return op(fresh.conn);
  }
}

/** Clear the connection cache (used by tests and on explicit re-auth). */
export function clearConnectionCache(): void {
  connectionCache.clear();
}
