/*******************************************************************************************
@Name           util/recordRef
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Record-reference resolver (classification half): decide whether a user-
                supplied record argument is a Salesforce Id, a pasted record URL (Lightning
                or Classic — parse the Id out), or a human identifier (name fragment /
                Story number). Pure logic; the SOQL half lives with each tool. Plan §5.5.
*******************************************************************************************/

import { looksLikeStoryNumber, normalizeStoryNumber } from './storyNumber.js';

/** How a record-identifying argument was classified. */
export type RecordRefKind = 'id' | 'url' | 'storyNumber' | 'name';

export interface RecordRef {
  kind: RecordRefKind;
  /** The raw input, trimmed. */
  raw: string;
  /** For `id`/`url`: the resolved 15- or 18-char Salesforce Id. */
  id?: string;
  /** For `storyNumber`: the normalized `SNNNNNN` (no dash). */
  storyNumber?: string;
  /** For `name`: the search fragment (echoes `raw`). */
  fragment?: string;
}

/** A 15- (case-sensitive) or 18-char (case-insensitive) Salesforce Id. */
const SALESFORCE_ID = /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/;

/** Alphanumeric run that is a plausible SF Id, for extracting from URLs. */
const ID_IN_URL = /\b([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})\b/;

/** True if the string is exactly a Salesforce Id. */
export function isSalesforceId(input: string): boolean {
  return SALESFORCE_ID.test(input.trim());
}

/**
 * Try to pull a Salesforce record Id out of a pasted URL. Handles common Lightning shapes
 * (…/lightning/r/<Object>/<Id>/view), Classic (…/<Id>), and query-string ids. Returns the
 * Id or null. We deliberately take the LAST id-shaped token, since Lightning URLs can carry
 * other 15/18-char-looking segments earlier (rare, but the record Id is last).
 */
export function extractIdFromUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  const matches = trimmed.match(new RegExp(ID_IN_URL, 'g'));
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1] ?? null;
}

/**
 * Classify a record-identifying argument. Precedence: URL (contains a parseable Id) →
 * bare Id → Story number → name fragment. The Story-number path only applies when the
 * caller indicates a Story context (default true); for non-Story objects pass
 * `allowStoryNumber: false` so "528" is treated as a name fragment.
 */
export function classifyRecordRef(
  input: string,
  opts: { allowStoryNumber?: boolean } = {},
): RecordRef {
  const allowStoryNumber = opts.allowStoryNumber ?? true;
  const raw = input.trim();

  const urlId = extractIdFromUrl(raw);
  if (urlId) return { kind: 'url', raw, id: urlId };

  if (isSalesforceId(raw)) return { kind: 'id', raw, id: raw };

  if (allowStoryNumber && looksLikeStoryNumber(raw)) {
    const storyNumber = normalizeStoryNumber(raw);
    if (storyNumber) return { kind: 'storyNumber', raw, storyNumber };
  }

  return { kind: 'name', raw, fragment: raw };
}
