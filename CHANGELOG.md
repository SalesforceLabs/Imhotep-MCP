# Changelog

Release notes for `imhotep-mcp`, documenting the delivered product at each release.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Breaking schema/interface changes are gated behind a new major version (e.g. `@2`).

## 1.1.1 — 2026-10-24

Dependency security refresh. No tool, schema, or config changes.

### Security

- Refreshed the lockfile so every dependency resolves to its latest compatible release, clearing
  17 of the 19 advisories `npm audit` reported against 1.1.0 (including the MCP SDK, jsforce,
  markdown-it, undici, and the build/test toolchain).
- Remaining: `zod` (fix requires the 3 → 4 major upgrade; tracked separately) and `body-parser`
  (fixed release still inside the install cooldown window; picked up in a later refresh).
- Context: the server runs over stdio only and never opens an HTTP listener, so the advisories in
  the SDK's HTTP-transport dependencies (express, body-parser, hono, proxy-addr) aren't reachable.

## 1.1.0 — 2026-10-24

Bulk Story writes: create, update, or move many Stories in one call — fewer round-trips, less
time, and fewer tokens than looping the single-Story tools.

### Added

- **`imhotep_create_stories`** — create 1–200 Stories in one call. Batch `defaults` (release,
  type, status, record type, parent story) apply to every item unless it overrides them; each
  Project is derived from its Release. Parent Stories must already exist.
- **`imhotep_update_stories`** — update writable fields on 1–200 Stories in one call.
- **`imhotep_transfer_stories`** — move 1–200 Stories to another Release in one call, keeping each
  Story's Project consistent.

### Behavior

- **All-or-nothing.** Every item is validated (picklists, field lengths, read-only fields,
  references) before any write, and the save uses Salesforce's all-or-none collection call. If any
  item fails, nothing is saved; the result lists every failing item by index.
- **Exact references in a batch.** Stories are named by number, Id, or URL; title fragments are
  refused so a fuzzy match can't hit the wrong record. Release names still resolve (scoped to the
  Story's Project for transfers), and an ambiguous one rejects the batch with candidates.
- **Skinny results.** Written Stories are re-read in one query and returned without rich-text
  bodies, in input order.
- The single-Story tools are unchanged.

## 1.0.0 — 2026-08-19

First release. Work with your Imhotep App Builder data — Projects, Releases, and Stories — from any
MCP client, as the authenticated Salesforce user.

**Compatibility:** Imhotep App Builder **v2.0.0+** (managed package, namespace `iab__`).

### Tools

- **Read/navigate:** `imhotep_list_projects`, `imhotep_get_project` (with `releases` / `resources`
  includes), `imhotep_list_releases`, `imhotep_get_release` (with `stories`), `imhotep_get_story`
  (with `bodies` / `children` / `tags`), `imhotep_list_stories`, `imhotep_search`.
- **Create/update:** `imhotep_create_story` (derives the Project from the Release; supports child
  stories), `imhotep_update_story` (including status), `imhotep_transfer_story`,
  `imhotep_update_release`.
- **Configure:** `imhotep_get_config`, `imhotep_set_config`, `imhotep_init_config`.

### Highlights

- **Runs as you.** Authenticates through your `sf` CLI session; your Salesforce permissions and
  Imhotep's validation rules apply to every read and write.
- **Human-friendly references.** A Story number, name, Salesforce Id, or pasted record URL all
  work wherever a record is expected.
- **Rich text in Markdown.** Story/Release body fields are read and written as Markdown; the server
  handles the HTML conversion.
- **Working context.** Set a default org, project, and current release once; tools assume them when
  you don't restate them.
- **Safe writes.** Confirm-before-write discipline, system-maintained fields refused, and an
  `autonomousMode` toggle (off by default) for unattended automation.
- **Ships with a skill** that teaches an AI client when and how to use the tools, plus
  `npx imhotep-mcp init` to scaffold configuration and install the skill.
