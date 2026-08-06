---
name: imhotep
description: "Work with Imhotep App Builder data (Projects, Releases, Stories) through the Imhotep MCP server. Use when the user wants to find, open, list, create, update, or move Imhotep records — e.g. \"show me S-528 and its child stories\", \"what's in flight in release 11.3\", \"create a story for the intake form\", \"mark S-528 Ready\", \"move S-528 to the 12.0 release\", \"set my default Imhotep org\". TRIGGER when: the request names an Imhotep Story/Release/Project (or a Story number like S-000528), or asks to read/create/update/transfer that data, or to configure the Imhotep MCP server. DO NOT TRIGGER when: the work is general Salesforce metadata/Apex/Flow/LWC, or DevOps Center Work Items (Imhotep 'Story' is not a DevOps Center 'Work Item'), or any org that doesn't have Imhotep App Builder installed."
---

# Imhotep App Builder

This skill teaches you to work with **Imhotep App Builder** — a managed-package PM / work-tracking
app on Salesforce — through the **Imhotep MCP server** (`imhotep_*` tools). The server does all the
mechanics (SOQL, REST, namespacing, HTML↔Markdown, validation). Your job is judgment: pick the
right tool, put content in the right field, and confirm before writing. **Never write SOQL or REST
here — always go through a tool.**

## The hierarchy (orient here first)

**Project → Release → Story.** A Story is the central artifact (the unit of work); it lives under a
Release, which lives under a Project. Stories carry rich-text bodies, child stories, tags, and
(v1.1+) tests and metadata-change logs.

> **Terminology:** an Imhotep **Story** is *not* a DevOps Center **Work Item**. Never call a Story a
> "work item" — Imhotep integrates with DevOps Center, which has its own Work Item object.

## Tool map (intent → tool)

**Find & read**
- Open one Story → `imhotep_get_story` (accepts a number like `528`/`S-528`/`S000528`, an Id, a
  pasted record URL, or a title fragment; returns candidates if ambiguous).
- "What's in flight" / "stories in release X" → `imhotep_list_stories` (filters: release, project,
  status, type, assignee, parent, tag — all optional and AND-combined).
- Open a Project / Release → `imhotep_get_project` / `imhotep_get_release`.
- List Projects / a Project's Releases → `imhotep_list_projects` / `imhotep_list_releases`.
- No number or exact name to go on → `imhotep_search` (free-text across Name + bodies).

**Create & change** (writes — see *Confirm before writing* below)
- New Story → `imhotep_create_story` (you give the Release; the server fills in the Project). Set
  `parent_story` to make it a child story.
- Change a Story, including status ("mark S-528 Ready") → `imhotep_update_story`.
- Move a Story to another Release → `imhotep_transfer_story` ("move to backlog" = transfer to the
  backlog Release; the server keeps the Story's Project consistent).
- Change a Release (status, dates, points goal, Release Notes) → `imhotep_update_release`.

**Configure**
- Show / change settings → `imhotep_get_config` / `imhotep_set_config`; scaffold a config file →
  `imhotep_init_config`.

## Story field semantics (the high-value part)

Imhotep has four rich-text body fields. Putting content in the *right* one is editorial judgment no
tool can enforce — get this right:

- **Description** — a **short** user story ("As a … I want … so that …"). Keep it brief; it is not
  the place for implementation detail.
- **Acceptance Criteria / Tests** — the definition of done and how it'll be verified.
- **Solution Build Notes** — the implementation detail. **Most substantive body content goes here**,
  not in Description.
- **Deployment Checklist** — **only** manual deploy steps *not* covered by DevOps Center Work Item
  promotion (e.g. "activate the flow", "assign the permission set"). Not a general notes field.

**Picklists (the real managed-package values):**
- Story **Status**: `Blocked`, `Defined`, `Building`, `Testing`, `Ready`, `Deployed`.
- Story **Type**: `New`, `Change`, `Defect`.
- Release **Status**: `Planning`, `Active`, `Accepted`.

**Record types:** Stories are `Standard` (full) or `Simple`. On *Simple* stories, child stories and
tasks aren't shown in the Imhotep UI — treat those as a Standard-story concept and don't surface
them for Simple stories unless asked.

**Rich text:** author body fields in **Markdown** — the server converts to/from the HTML Salesforce
stores. Don't hand-write HTML.

## Field limits & rules (draft within these the first time)

The server **enforces** these before every write and returns a clear error if you exceed them — but
draft within them up front so you don't waste a round-trip on a rejection:

- **Story / Release / Project name (title) — max 80 characters.** This is the one that bites most:
  keep titles short and specific. If a user's phrasing would exceed 80, tighten it (don't just
  truncate mid-word) and mention you shortened it.
- **Release Description — max 1000 characters** (short summary). Longer release prose goes in
  **Release Notes** (`notes`, up to 32768).
- **Project Description — max 32768 characters.**
- **Story bodies** (Description, Acceptance Criteria, Solution Build Notes, Deployment Checklist) —
  up to 131072 characters each; effectively no practical limit, but respect the *semantic* split
  above (keep Description short regardless of the limit).
- **Picklists / Type / Status** — use only the values listed above; the server rejects others.
- **Required:** a Story needs a Release; a Release needs a Project. The server derives Story.Project
  from the Release automatically — don't set it yourself.

## Confirm before writing

Platform permissions decide what the user *can* do; **you** decide what they *should* do right now.
Before any write (`create_story`, `update_story`, `transfer_story`, `update_release`) or a config
change:

1. **Preview** the change — say what will be written, to which record, in which org.
2. **Get the user's OK** before calling the tool. This matters most against **production** data.
3. `imhotep_set_config` is explicitly two-step: it returns a validated preview first; call it again
   with `confirm: true` only after the user agrees.

**Autonomous mode:** if the user has set `autonomousMode: true` in config, they've opted into
unattended writes (e.g. a subagent in a build loop) — the confirm step can be relaxed *for that
context*. It is **off by default**; when off, always confirm.

## Which org / project / release (working context)

Tools accept an optional `org`, and list/create tools an optional `project`/`release`. When the user
omits them, the server falls back to configured defaults (`defaultImhotepOrg`, `defaultImhotepProject`,
`currentImhotepRelease`). So:

- If a request is ambiguous about **which org** Imhotep is in and no default is set, ask once —
  then suggest saving it with `imhotep_set_config` (`defaultImhotepOrg`) so it's not asked again.
- **Org is per-scope.** `defaultImhotepOrg` can be set **globally** (your usual org) *or* **per-project**
  (`scope: "project"` writes it to that repo's `./imhotep.config.json`, overriding the global). When
  a user works across different Imhotep orgs in different repos, set a project-level `defaultImhotepOrg` in
  each — so each project targets the right org without restating it. Offer this when you notice a
  user in a repo whose org differs from their global default.
- Similarly, offer to set `defaultImhotepProject` / `currentImhotepRelease` when a user repeatedly
  works in the same project/release. This makes "what's in flight" work without restating context.
  (These keys were formerly `defaultOrg` / `defaultProject` / `currentRelease` — the old names still
  work but are deprecated; use the new `defaultImhotepOrg` / `defaultImhotepProject` /
  `currentImhotepRelease`.)
- A record reference can be a name, a Story number, an 18/15-char Id, or a pasted record URL — pass
  whatever the user gives you; the server resolves it (and returns candidates if it's ambiguous).

### Starting work in a new project (proactive setup)

When a user first uses Imhotep in a **new repo/workspace** — or their requests keep needing an
org/project/release you have to ask for — proactively help them set up a **project-scoped** config so
this repo "just works" afterward. A project config lives at `./imhotep.config.json` and overrides the
global for this repo. Typical flow:

1. Confirm **which Imhotep org** this project targets. If it differs from the global `defaultImhotepOrg`,
   set it project-scoped: `imhotep_set_config` with `key: "defaultImhotepOrg"`, `scope: "project"`.
2. Set the **working context** for this repo, project-scoped:
   - `defaultImhotepProject` — the Imhotep Project this repo's work belongs to.
   - `currentImhotepRelease` — the release currently being built (update it as the build advances).
3. Each `set_config` previews first (two-step); get the user's OK, then `confirm: true`.

You don't have to hand-author the file — `imhotep_set_config` (`scope: "project"`) creates
`./imhotep.config.json` on first write. `imhotep_init_config` (`scope: "project"`) is available too,
for scaffolding a fully-commented starter up front. **Always write the current key names**
(`defaultImhotepProject`, `currentImhotepRelease`) — not the deprecated `defaultProject` /
`currentRelease`. After setup, "what's in flight" / "create a story titled …" work in this repo
without restating org/project/release.

## Shipped vs. yours (customize in the right place)

> **Don't edit the Imhotep MCP package or this shipped skill — your changes are lost.** This skill
> is shipped and kept current: the server refreshes it (overwrites it) on install, update, and
> startup, so any hand-edits here are replaced. Put **org-specific structure** (default org, custom
> fields, extra picklist values, record-type defaults) in **`imhotep.config.json`** (global
> `~/.imhotep/` or per-project `./`), and **narrative guidance** ("we skip the Testing status", "tag
> every Defect with 'triage'") in your project's **`CLAUDE.md`** or memories. Config is for the
> machine; CLAUDE.md is for the model.

For your own repeatable workflows on top of these tools, create a *separate* local skill (e.g.
`imhotep-custom`) rather than editing this one.

## Guardrails

- **No SOQL or REST recipes** — every operation is a tool call. If a capability isn't a tool, it
  isn't available yet (it may be a v1.1/later roadmap item); say so rather than improvising raw
  queries.
- **Deletes and creating/deleting Projects or Releases are out of scope** — those stay UI /
  Data-Loader operations. Don't attempt them.
- **Report tool errors faithfully.** The server returns plain-language messages (e.g. a permission
  or validation refusal naming the object/field/org) — relay them; don't paper over a failure.
