/*******************************************************************************************
@Name           util/richtext
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Rich-text conversion for Imhotep Story/Release body fields, which Salesforce
                stores as HTML. This module handles HTML → Markdown (for reads) via turndown;
                the Markdown → HTML direction (for writes) arrives in Increment 3. Plan §5.2, §5.5.
*******************************************************************************************/

import TurndownService from 'turndown';

// One shared, configured instance. Salesforce rich-text areas use a constrained HTML subset
// (headings, bold/italic/underline, lists, links, paragraphs, line breaks); ATX headings and
// fenced output keep the Markdown clean and round-trippable.
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
});

/**
 * Convert a Salesforce rich-text HTML value to Markdown. Returns null for null/undefined input
 * (so an empty body stays empty rather than becoming the string "null"); returns '' for an
 * empty/whitespace-only body.
 */
export function htmlToMarkdown(html: string | null | undefined): string | null {
  if (html === null || html === undefined) return null;
  const trimmed = html.trim();
  if (trimmed === '') return '';
  return turndown.turndown(trimmed);
}
