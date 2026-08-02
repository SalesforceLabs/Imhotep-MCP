import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../src/util/richtext.js';

describe('htmlToMarkdown', () => {
  it('converts common Salesforce rich-text HTML to Markdown', () => {
    expect(htmlToMarkdown('<p>A <strong>bold</strong> and <em>italic</em> line.</p>')).toBe(
      'A **bold** and _italic_ line.',
    );
  });

  it('converts headings and lists', () => {
    const html = '<h2>Title</h2><ul><li>one</li><li>two</li></ul>';
    const md = htmlToMarkdown(html)!;
    expect(md).toContain('## Title');
    // turndown renders bullets as "-" followed by padding; assert on the marker + content.
    expect(md).toMatch(/-\s+one/);
    expect(md).toMatch(/-\s+two/);
  });

  it('converts links', () => {
    expect(htmlToMarkdown('<a href="https://x.test">link</a>')).toBe('[link](https://x.test)');
  });

  it('returns null for null/undefined (empty body stays empty, not "null")', () => {
    expect(htmlToMarkdown(null)).toBeNull();
    expect(htmlToMarkdown(undefined)).toBeNull();
  });

  it('returns empty string for whitespace-only input', () => {
    expect(htmlToMarkdown('   ')).toBe('');
    expect(htmlToMarkdown('')).toBe('');
  });
});
