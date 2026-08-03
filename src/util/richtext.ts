/*******************************************************************************************
@Name           util/richtext
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Rich-text conversion for Imhotep Story/Release body fields, which Salesforce
                stores as HTML. HTML → Markdown (for reads) via turndown; Markdown → HTML (for
                writes) via markdown-it. Plan §5.2, §5.5.
*******************************************************************************************/

import TurndownService from 'turndown';
import MarkdownIt from 'markdown-it';

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

// Markdown → HTML for writing rich-text fields. `html: false` keeps raw HTML in the input
// from passing through (we author in Markdown, not hand-written HTML); linkify off to avoid
// surprising auto-links; typographer off to keep output literal.
const markdownIt = new MarkdownIt({ html: false, linkify: false, typographer: false });

/**
 * Convert Markdown to the HTML stored in Salesforce rich-text fields. Returns null for
 * null/undefined (leave the field unset) and '' for empty/whitespace-only input (clear it).
 */
export function markdownToHtml(markdown: string | null | undefined): string | null {
  if (markdown === null || markdown === undefined) return null;
  const trimmed = markdown.trim();
  if (trimmed === '') return '';
  return markdownIt.render(trimmed).trim();
}
