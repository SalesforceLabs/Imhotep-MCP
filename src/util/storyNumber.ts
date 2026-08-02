/*******************************************************************************************
@Name           util/storyNumber
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Normalize the many ways a user might type an Imhotep Story number into the
                canonical `SNNNNNN` form (S + 6 digits, NO dash — confirmed against the live
                managed package). Handles 528 / S-528 / #s528 / S000528, etc. (plan §5.1).
                Pure string logic — no I/O.
*******************************************************************************************/

/** Canonical Story-number width (zero-padded digits after "S"). */
const STORY_NUMBER_WIDTH = 6;

/**
 * Return true if the input looks like a Story-number reference (as opposed to a title
 * fragment or an Id). Accepts an optional leading '#', optional 'S'/'s', optional '-',
 * then digits — e.g. "528", "S-528", "#s528", "S000528".
 */
export function looksLikeStoryNumber(input: string): boolean {
  return /^\s*#?\s*[sS]?-?\d{1,}\s*$/.test(input);
}

/**
 * Normalize a loose Story-number reference to canonical `SNNNNNN` (no dash — matches the
 * managed package's auto-number format). Returns null if the input doesn't look like a
 * Story number (caller should then treat it as a title fragment or Id).
 *
 * Examples: "528" → "S000528"; "s-528" → "S000528"; "#S528" → "S000528";
 *           "S000528" → "S000528"; "1234567" → "S1234567" (won't truncate above width).
 */
export function normalizeStoryNumber(input: string): string | null {
  if (!looksLikeStoryNumber(input)) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return null;
  const padded = digits.padStart(STORY_NUMBER_WIDTH, '0');
  return `S${padded}`;
}
