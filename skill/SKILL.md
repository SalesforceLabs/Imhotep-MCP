---
name: imhotep
description: "Work with Imhotep App Builder data (Projects, Releases, Stories) through the Imhotep MCP server. Use when the user wants to find, open, list, create, update, or move Imhotep records — e.g. \"show me S000528 and its child stories\", \"what's in flight in release 11.3\", \"create a story for the intake form\", \"mark S000528 Ready\", \"move S000528 to the 12.0 release\", \"set my default Imhotep org\". TRIGGER when: the request names an Imhotep Story/Release/Project (or a Story number like S000528), or asks to read/create/update/transfer that data, or to configure the Imhotep MCP server. DO NOT TRIGGER when: the work is general Salesforce metadata/Apex/Flow/LWC, or DevOps Center Work Items (Imhotep 'Story' is not a DevOps Center 'Work Item'), or any org that doesn't have Imhotep App Builder installed."
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
- Open one Story → `imhotep_get_story` (accepts a number like `528`/`S000528`, an Id, a
  pasted record URL, or a title fragment; returns candidates if ambiguous).
- "What's in flight" / "stories in release X" → `imhotep_list_stories` (filters: release, project,
  status, type, assignee, parent, tag — all optional and AND-combined).
- Open a Project / Release → `imhotep_get_project` / `imhotep_get_release`.
- List Projects / a Project's Releases → `imhotep_list_projects` / `imhotep_list_releases`.
- No number or exact name to go on → `imhotep_search` (free-text across Name + bodies).

**Create & change** (writes — see *Confirm before writing* below)
- New Story → `imhotep_create_story` (you give the Release; the server fills in the Project). Set
  `parent_story` to make it a child story.
- Change a Story, including status ("mark S000528 Ready") → `imhotep_update_story`.
- Move a Story to another Release → `imhotep_transfer_story` ("move to backlog" = transfer to the
  backlog Release; the server keeps the Story's Project consistent).
- Change a Release (status, dates, points goal, Release Notes) → `imhotep_update_release`.

**Configure**
- Show / change settings → `imhotep_get_config` / `imhotep_set_config`; scaffold a config file →
  `imhotep_init_config`.

## Story field semantics (the high-value part)

A Story is a **durable system-of-record** — authored for humans (the team, and future-you),
built to outlive any one build. That's its relationship to a plan/spec/design doc: **the plan is
the transient execution detail; the Story is the durable bookends** — the *intent* going in and
the distilled *record* coming out. So when a detailed plan or spec exists for a Story's scope,
the Story **summarizes and points to it — it does not transcribe it.**

**Critical: the Story must stand alone.** A plan may be local, temporary, or absent entirely, so
never make the Story *depend* on it — write each field to be self-sufficient at the summary
altitude, referencing the plan for those who have it. "See the plan" is a dangling pointer, not a
Story.

Imhotep has four rich-text body fields. Putting content in the *right* one, at the *right
altitude*, is editorial judgment no tool can enforce — get this right:

- **Description** — a **short** user story ("As a … I want … so that …"). Keep it brief; protect
  it from implementation detail. It may start as a rough seed and get sharpened over time (see
  *Editing a Story* below) — but it stays a short statement of intent.
- **Acceptance Criteria / Tests** — the acceptance conditions / definition of done: what you'd
  check to *accept* the Story, and how it's verified. Not a dump of test code.
- **Solution Build Notes** — the durable **distillation of the solution**, NOT a transcription
  of the plan. High-signal only. Structure it as:
  - **Solution summary** — functional *and* technical, at altitude (what was done and why — a few
    paragraphs, not the step-by-step).
  - **Key decisions & rationale** — why this approach; what was considered and rejected. *This is
    the highest-value content* — it's what a plan captures only temporarily.
  - **References (where relevant and useful)** — the plan/spec, related docs, and any URL or
    Salesforce Help article that genuinely matters (a known issue/outage the bug relates to, a
    security policy being implemented, a link quoted in the work). Don't manufacture links to fill
    this out — include a reference only when there's a real reason to point to it.
  - **Gotchas / concerns / risks** — what a future reader needs flagged.
  - **Build checklist** — the waves/increments, **one line each** (what it builds / what got
    built). Keep it lean — decisions and outcomes, not a blow-by-blow log.
  - **Metadata manifest** — components **New / Updated / Deleted**, each as: metadata **type**
    (Flow, Apex class, LWC, permission set, …), **name/label**, and **API name**.

  Principle: **map + decisions + manifest, not the territory.** If it's execution detail already
  in the plan, link to it — don't copy it in.
- **Deployment Checklist** — **only** the manual, by-hand steps a human must perform to deploy —
  the things you won't or can't let automation/DevOps Center do (e.g. activate a Flow, replicate
  a setting DevOps Center can't deploy, edit a Profile, a post-deploy data step). If a step can
  be automated or DevOps Center can deploy it, it does **not** belong here. This is **not** a
  general build checklist and **not** a notes field.

**Picklists (the real managed-package values):**
- Story **Status**: `Blocked`, `Defined`, `Building`, `Testing`, `Ready`, `Deployed`.
- Story **Type**: `New`, `Change`, `Defect`.
- Release **Status**: `Planning`, `Active`, `Accepted`.

**Record types:** Stories are `Standard` (full) or `Simple`. On *Simple* stories, child stories and
tasks aren't shown in the Imhotep UI — treat those as a Standard-story concept and don't surface
them for Simple stories unless asked.

**Rich text:** author body fields in **Markdown** — the server converts to/from the HTML Salesforce
stores. Don't hand-write HTML.

## Editing a Story (update discipline)

Updates **overwrite** — the server replaces the whole field value with whatever you send; it does
not merge or append. So when changing an *existing* Story:

1. **Read first** — `imhotep_get_story` to see the current field contents.
2. **Preserve, then extend or patch:**
   - **Append** to log-shaped content (Build Notes' build checklist, decisions, metadata
     manifest) — add the new entry; keep the prior ones.
   - **Patch in place** the changed span of prose (Description, Acceptance Criteria) — a seed
     Story's intent is *refined* as understanding sharpens, not replaced.
3. **Re-send the merged whole.** **Never regenerate a field from scratch on update** — you'll
   destroy prior context and the user's original wording.

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

1. **Present the complete change set — just before writing.** Show every field that will change
   and its new value. For an edited rich-text body, show the **merged result you're about to
   send** (you read it first, preserved what was there, and patched/appended — see *Editing a
   Story*), not a vague "I'll update the notes." Name the record (Story #/name) and the org.
2. **Get the user's explicit OK immediately before the tool call.** This holds for every write —
   `create_story`, `update_story`, `transfer_story`, `update_release` — and config changes. It
   matters most against **production** data.
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
for scaffolding a fully-commented starter up front. After setup, "what's in flight" / "create a
story titled …" work in this repo without restating org/project/release.

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
