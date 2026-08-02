# Imhotep MCP Server + Skill — Plan

- **Status:** Approved (Increment 0 complete; signed off 2026-08-02) — ready for Increment 1
- **Date:** 2026-08-01 (finalized 2026-08-02)
- **Owner:** Mitch Lynch
- **Related:** [`sf-skills-reconciliation-2026-07-27.md`](sf-skills-reconciliation-2026-07-27.md)
- **Design target:** the **managed, namespaced** version of Imhotep App Builder — namespace is
  **always `iab__`** (e.g. `iab__Story__c`), fixed and non-configurable
- **Upstream app repo (source, provided as a courtesy):** https://github.com/SalesforceLabs/Imhotep-App-Builder
- **Resource Hub:** https://imhotepsupport-dev-ed.develop.my.site.com/resourcehub/s/

### Framing (read first)
This is a **net-new product**, designed from the ground up around what we need it to do. A
private, local prototype skill was run on one machine for a couple of weeks; it is **not
shared or used by anyone**, and this plan is **not** a response to improving it. The prototype
simply *informed* our understanding of the problem. Nothing here is constrained by it.

The assets are built for the **managed package** (namespaced objects/fields, e.g.
`iab__Story__c`). This initiative **releases in tandem with managed-package updates**; the
open-source repo is published afterward only as a courtesy. The namespace is **always `iab__`**
— fixed, hard-coded in the server, and **not** a configurable value. (The `imhotep__` prefix
seen in the author's pantry org is only a pre-release build and is out of scope.)

---

## Kickoff — starting this as a fresh project

This plan is the **source of truth** and is written to stand alone. When picking it up in a new
session (e.g. VS Code Claude extension), read it end-to-end first, then start at §11 Increment 1.
Setup facts a fresh session needs (they live nowhere else):

- **Move this doc into the new repo** (e.g. `docs/plans/`) so it travels with the code. Auto-
  memory is keyed to a workspace folder and will **not** follow you to a new project — the doc is
  the handoff vehicle.
- **Build/test org — requires the *managed* (`iab__`) Imhotep package.** Develop and verify
  against an org with the managed package installed. ⚠️ The author's pantry org runs the
  **pre-release `imhotep__`** build and is **not** a valid schema-of-record — do not target it
  for build/verify.
- **Confirm the schema live.** The Appendix object model was read from the app *source* (field
  names shown un-prefixed). Before/at build, verify exact API names, picklist values, and record
  types by describing against the managed `iab__` org (the "live picklist confirmation" check in
  §10).
- **The local prototype skill is superseded.** It has been renamed to
  `~/.claude/skills/imhotep-prototype/` (freeing the `imhotep/` slot for our shipped skill); it is
  **not** this product and must not be reused or treated as spec (see Framing). It is
  **decommissioned in Increment 5** once the shipped skill is installed and proven (§11).
- **Dev toolchain** (beyond §9's runtime prereqs): Node.js 18+, TypeScript,
  `@modelcontextprotocol/sdk`, `jsforce`, `markdown-it`, `turndown`, `jsonc-parser`, `zod`, and
  the `sf` CLI authenticated to the managed `iab__` org. (Data-access rationale in §0.)
- **Process.** The standing gated build process applies: per increment, build → verify → review
  → sign-off; no deploy/publish without explicit approval.

---

## 0. Increment 0 — finalize decisions (locked 2026-08-02)

The design in §§1–12 is settled and unchanged. This section records the engineering decisions
resolved at finalize so the build doesn't improvise them. Salesforce-specific claims below were
grounded against the official docs during review (guest Support Knowledge REST API §5.3; `sf`
CLI access-token pattern §6 — both confirmed).

**Data-access architecture (implements §4.1, §6).**
- **Auth:** shell `sf org display --json` for the resolved org to obtain `accessToken` +
  `instanceUrl` (the documented "CLI-as-connected-app" pattern). No tokens printed or persisted
  by the server (§6 token hygiene).
- **API client:** **`jsforce`** for SOQL, CRUD, and describe against the org's REST API — chosen
  over raw `fetch` (better structured output, describe caching, error surfacing) and over
  shelling `sf data` per call (avoids per-call process-spawn latency). `sf` is used *only* for
  auth; all data operations go through `jsforce` with the CLI-provided token.
- **Session expiry:** on `INVALID_SESSION_ID` / HTTP 401, re-shell `sf org display` once for a
  fresh token and retry (the CLI auto-refreshes); surface a clear message if re-auth fails.
- **apiVersion:** ship a pinned default; on first contact discover the org's max via
  `/services/data/` and cap the pinned value to it.

**Supporting libraries (implements §5.2 rich text, §7 config).**
- **Rich text:** `markdown-it` (Markdown→HTML) + `turndown` (HTML→Markdown), constrained to the
  HTML tag subset Salesforce rich-text fields accept.
- **Config:** `jsonc-parser` — supports the commented `.jsonc` config (§7.4) *and*
  comment-preserving in-place edits for `imhotep_set_config` (§5.2). Global writes are atomic
  (temp file + rename).
- **Record types:** resolve `Simple`/`Standard` DeveloperName → RecordTypeId via a cached
  describe/query, per org.

**Skill + global-config delivery (resolves the §4.2/§8 "how does the skill reach the user?" gap).**
An `npx` MCP install can't place a skill into a client, so **`npx imhotep-mcp init` (and its
conversational twin `imhotep_init_config`) is the single delivery vehicle** for both:
- copies the **shipped skill** into `~/.claude/skills/imhotep/` (no-clobber), and
- scaffolds the starter **global** `~/.imhotep/config.json` (no-clobber).

This keeps the **server itself client-agnostic on npm** (the reason §7.1 uses `~/.imhotep/`, not a
Claude folder) while placing the inherently-Claude skill artifact in an explicit, Claude-aware
step. Two distinct config artifacts remain separate and must not be conflated: the package ships
**`config.default.json`** (read-only baked-in defaults, replaced on update — §7.3), while the
customer's **`~/.imhotep/config.json`** is scaffolded on demand and *never* overwritten.
*Roadmap (not v1):* a thin Claude Code plugin bundling the skill + a `.mcp.json` pointing at
`npx imhotep-mcp`, for one-command Claude Code onboarding without compromising the
client-agnostic server.

**Verification org.** Verification runs against the **Imhotep managed (`iab__`) install in the
author's GPS Accelerators *production* org**; the live end-to-end acceptance criteria stand as
written (§11). The author provides the exact org alias at the increment that first needs it. The
pre-release `imhotep__` pantry org remains out of scope for build/verify (§Framing). Increments
1–4 are still authored as unit-testable, org-independent logic where possible, with live
verification against the managed org at each increment's gate. ⚠️ **Because verification is a
production org, write-tool testing carries real stakes** — the confirm-before-write discipline
(§8) and the default-off `autonomousMode` posture (§6) apply during the build itself, and early
write verification should favor throwaway test Stories under a disposable Release.

---

## 1. Context & objective

Imhotep App Builder is a managed-package PM / work-tracking app on the Salesforce platform.
Its central artifact is the **Story** (`iab__Story__c`) — a user story that carries the
full build lifecycle — organized under **Releases**, which live under **Projects**. Directly
around a **Story** sit metadata-change tracking, tests, and tags; the **Project** also carries
a metadata-component catalog, resource links, and members. (Templates are a standalone,
reusable library, not part of the Project hierarchy.)

> **Terminology:** "Story" is Imhotep's central artifact. **"Work Item" is reserved** for the
> DevOps Center object of that name — Imhotep is planned to integrate with DevOps Center, so we
> never call a Story a "work item." (Where this plan mentions "Work Item promotion," it means
> DevOps Center's Work Item, not a Story.)

**Objective:** give Imhotep customers a first-class way to work with their Imhotep data from
an AI coding assistant (Claude Code / Claude Desktop / any MCP client), so that natural
requests — "show me S-528 and its child stories," "what's in flight in release 11.3," "log
that I changed the AccountTrigger under this story," "move S-528 to the 12.0 release" — each
resolve to a **single, reliable tool call** instead of a hand-built sequence of queries and
REST writes.

**Just as important, the tools are composable primitives**, not only a way to answer a live
request. Customers will wire them into their *own* configurations — a **memory**, a
**CLAUDE.md** instruction, a **custom skill**, or a **custom subagent** — so that Imhotep
operations become steps inside their automated build workflows (e.g. a subagent that, at the
end of an increment, logs the metadata changes and flips the Story to `Ready` without a human
in the loop). The shipped skill (§4.2) is therefore just *one* consumer of the tools; a
customer's own skills, subagents, and instructions are equal-citizen callers.

**Design implications of this** (carried through the spec):
- **Stable, versioned interfaces.** A config that names `imhotep_create_story` must not break
  on an update — this is why semver, the unscoped npm name, and the `@1` pin (§9) matter.
- **Single-purpose, predictably named verbs** that compose cleanly into someone else's
  automation.
- **Structured, machine-usable output** (not just prose for a human) so a subagent can act on
  a result — e.g. use the returned `S-NNNNNN` or record Id in its next step.
- **Non-interactive safety.** Because a subagent may call a write tool without a human present,
  the server's own guarantees (permission enforcement §6, read-only-field refusal, validation-
  safe writes) — not just the skill's confirm-before-write prompt — are what keep automated use
  safe.

**Two shipped assets:**
1. An **MCP server** (`imhotep-mcp`) — the deterministic engine (tools, schema, conversions,
   validation, auth). The baked-in `config.default.json` ships *inside* this package.
2. A **skill** — the context and guardrails that teach an AI client *when* and *how* to use
   the tools, and Imhotep's field semantics.

*(Only these two are shipped. The customer's config files — global `~/.imhotep/config.json` and
project `./imhotep.config.json` — are generated on demand by `init` and owned by the customer,
never overwritten; they are the customization surface (§4.3), not shipped assets. The one
genuinely-shipped config is `config.default.json`, bundled inside the server package above.)*

**Success looks like:** the common Imhotep operations are one call each; the app's schema
lives in exactly one place (the server); and the tools respect the running user's Salesforce
permissions and Imhotep's own validation rules by construction.

---

## 2. Approach — why an MCP server *and* a skill

- **A skill is instructions; an MCP server is verbs.** Instructions alone force the AI to
  re-derive the same mechanical steps (build query → run → convert → write → verify) on every
  request. Those steps belong in code that runs the same way every time.
- **A server alone isn't enough either.** The AI still needs to know *which* tool fits a
  request, Imhotep's field semantics (what content goes in which rich-text field), and when to
  stop and confirm before writing. That judgment lives in the skill.
- **Local (stdio) server = $0 hosting.** The server runs as a subprocess on the user's machine
  over stdin/stdout. Nothing to host or pay for. Shippable directly via npm and the repo.

---

## 3. What the assets must do (requirements)

Informed by the prototype, these are the capabilities the product must deliver. They are
requirements, not a critique of prior work.

1. **Navigate the hierarchy cheaply.** Everything hangs off a **Project** (top of the
   master-detail chain: Project → Release → Story, plus metadata components, resources, and
   other ancillary objects). Users must be able to find a Project, list its Releases, list a
   Release's Stories, and open a single Story — without hand-writing SOQL.
2. **Open a Story in full context.** A Story is a hub. Viewing "the whole story" may mean its
   bodies, child stories, and tags (v1) — plus its metadata-change log, tests, and tasks
   (v1.1), and attached Files/Notes/Chatter (later) — selectable, not all-or-nothing.
3. **Write safely.** Create and update Stories (and related records) without tripping Imhotep's
   validation rules (notably Story `Project` must equal its Release's `Project`) or writing
   system-maintained fields — and always as the authenticated user, so Salesforce enforces
   their permissions.
4. **Handle rich text.** The four Story body fields are HTML. The AI should read them as
   Markdown and author them in Markdown; the server does the conversion both ways.
5. **Speak the managed-package schema natively.** Namespaced API names, real picklist values,
   record types (`Simple` / `Standard`), and the `Release_Mode` value set — correct out of the
   box, adaptable via config for orgs that extended the package.
6. **Answer "how does Imhotep work?"** Surface Imhotep best-practice/help content from the
   Resource Hub so the AI can answer product questions accurately, with citations (§5.3).

---

## 4. Architecture — the three artifacts

Three distinct pieces, each with a clear owner and update path. The first two are **ours**
(shipped, versioned, replaced on update). The third is **the customer's** (never overwritten).

### 4.1 The MCP server (`imhotep-mcp`) — *shipped, updatable*
**Purpose:** the deterministic engine. It is the only piece that talks to Salesforce. It owns:
- the **tool surface** (the verbs an AI client can call — §5);
- the **canonical schema** of the managed package (object/field API names, picklists, record
  types) as baked-in defaults;
- all **mechanics**: namespace prefixing, story-number normalization, deriving Story.Project
  from its Release, HTML↔Markdown conversion, refusing system-maintained fields, and
  re-querying to verify writes;
- **authentication (bootstrap only)**, by shelling out to the user's installed `sf` CLI:
  `sf org display --target-org <alias> --json` yields the `instanceUrl` + a live `accessToken`,
  cached per session and refreshed by re-running the CLI on a `401`. This is the CLI's *only*
  role — so every call runs as that user, under their Salesforce permissions (§6).
- **data access via the org's REST APIs** (over HTTPS with that token — *not* CLI data
  commands), through the **`jsforce`** client (§0): SOQL for reads; sObject CRUD for single
  writes; the **Composite API** for multi-record ops (parent + child stories, or a Story plus its
  `include` related data in one round-trip); and **describe** for schema/picklist/key-prefix
  confirmation. Direct REST is chosen over `sf data …` because per-call CLI process spawns are
  slow and `--values` is hostile to the four rich-text HTML fields (a lesson from the prototype);
  `jsforce` is chosen over a hand-rolled `fetch` wrapper for its query pagination, describe
  caching, Composite support, and structured error surfacing (data-access rationale in §0).

Because the schema and mechanics live here, correcting or extending them is a single package
release — customers get the fix by updating, with nothing to hand-edit.

### 4.2 The skill — *shipped, updatable*
**Purpose:** the judgment layer that a raw tool list can't carry. It teaches an AI client:
- **which tool** maps to a user's intent;
- **Imhotep's field semantics** — e.g. Story Description is a *short* user story, while
  implementation detail belongs in Solution Build Notes; what does/doesn't go in the
  Deployment Checklist;
- **confirm-before-write** discipline (platform permissions govern *can*; the human governs
  *should*);
- **target-org resolution** as a conversation (which org is Imhotep installed in?);
- the **shipped-vs-yours boundary** (§4.3) so customers customize in the right place.

The skill contains **no SOQL or REST recipes** — those are the server's job. It is prose +
guardrails, shipped alongside the server and updated with it.

### 4.3 The customization surface — *the customer's, never overwritten*
**Purpose:** everything a specific customer needs to tailor, kept in files the server and skill
*read* but updates never *touch*. These live outside the package (in the user's home dir or
their project); `npx imhotep-mcp init` can scaffold starter versions on demand (§7.3), and
nothing here is ever overwritten by an update:
- **`imhotep.config.json`** — structural overrides: default org, working context
  (`defaultProject`/`currentRelease`), any custom fields the customer added to Imhotep objects,
  extra picklist values, record-type defaults, default `include` sets, and the autonomous-write
  toggle. Lives **global** (`~/.imhotep/config.json`, cross-project)
  and/or **per-project** (`./imhotep.config.json`, overrides global). Full treatment in §7.
  *Optional* — the server runs on baked-in defaults without it.
- **Project `CLAUDE.md`** — narrative, org-specific guidance ("we don't use the Testing
  status," "tag every Defect with 'triage'," "our Imhotep prod org alias is `acme-prod`").
- **An optional local skill** (e.g. `.claude/skills/imhotep-custom/`) — the customer's own
  workflows layered on top of the shipped tools.

**Guardrail (stated in the skill):** *"Don't edit the Imhotep MCP package or the shipped skill
— your changes are lost on update. Put org-specific structure in `imhotep.config.json` and
narrative guidance in your project's CLAUDE.md."*

---

## 5. Functional spec — the tools

> **Design principle:** one tool per user *intent*, not one per API call. Tool inputs are
> namespace-free and human-friendly; the server does the mechanical work behind each verb. (How
> record-identifying arguments accept a name fragment / Story number, an Id, or a pasted record
> URL is the record-reference resolver — §5.5.)

Phase column: **v1** = first release; **v1.1** = fast-follow; **later** = roadmap. (v1 tools are
marked **v1** in the tables below; the full increment plan is §11.)

### 5.1 Read tools

| Tool | What it's for | Phase |
|---|---|---|
| `imhotep_list_projects(query?, status?, org?)` | Locate/enumerate Projects. `query` = a name fragment (or a pasted Id/URL to short-circuit straight to that record — §5.5); `status` filters by `Planning\|Active\|Completed`. With neither, returns all. The Project is the top of the hierarchy — most work starts here. | v1 |
| `imhotep_get_project(project, include?, org?)` | Open one Project: core fields + point/count rollups, optionally its Releases, Resource Links, Metadata Components, and Members (see the `include` options in §5.4). `project` = name, Id, or record URL (§5.5). | v1 |
| `imhotep_list_releases(project, status?, is_backlog?, org?)` | List a Project's Releases (with points goal/remaining, dates, and the `iab__Is_Backlog__c` flag). `is_backlog=true` filters to the backlog Release(s). | v1 |
| `imhotep_get_release(release, include?, org?)` | Open one Release: fields, points rollups, Release Notes, optionally its Stories. | v1 |
| `imhotep_get_story(story, include?, org?)` | Open one Story with selectable related data (see §5.4). Normalizes `528`/`S-528`/`#s528`→`S-000528`; on a miss, returns candidates rather than "not found." | v1 |
| `imhotep_list_stories(release?, project?, status?, type?, assigned_to?, parent_story?, tag?, limit=50, org?)` | The workhorse list ("what's in flight," "stories in release X"). Skinny (no bodies), ordered `Priority_Order NULLS LAST, Story_Number`. Filters AND-combined. | v1 |
| `imhotep_list_metadata_components(project, type?, category?, org?)` | List the Project's catalog of metadata components (Apex, Flow, LWC, …). | v1.1 |
| `imhotep_list_metadata_changes(story?, release?, project?, org?)` | List Metadata Component Change records, filtered by Story/Release/Project. | v1.1 |
| `imhotep_get_story_tests(story, org?)` | Return a Story's Test Scenarios and Test Results. | v1.1 |
| `imhotep_search(query, object="Story", fields?, limit=25, org?)` | Free-text search across Name + body fields when the user has no number/name. Keeps common tools narrow. | v1 |

### 5.2 Write tools

All write tools: accept **Markdown** for rich-text fields (server → HTML); **refuse**
system-maintained fields (auto-number, rollups, formulas); run **as the authenticated user**
(Salesforce enforces CRUD/FLS/sharing — §6); and are described so the AI **previews the payload
+ target org and gets user approval before calling.**

| Tool | What it's for | Phase |
|---|---|---|
| `imhotep_create_story(release, title, description?, acceptance_criteria?, build_notes?, deployment_checklist?, type="New", status="Defined", parent_story?, points?, priority_order?, record_type?, org?)` | Create a Story. **Derives Project from Release automatically** (avoids the validation trap). `release`/`parent_story` accept Id, name, or number. Set `parent_story` to create a child Story. Returns the new `S-NNNNNN`. | v1 |
| `imhotep_update_story(story, <writable fields…>, org?)` | Update any writable Story field (scalar or rich-text) — including `status` (validated against the live/config picklist). Markdown in, HTML out. Covers "mark S-528 Ready" via the `status` field (the skill maps that phrasing here). | v1 |
| `imhotep_transfer_story(story, to_release, org?)` | Move a Story to another Release (reparenting the master-detail — already supported in the Imhotep UI today). Server handles the **Project = Release.Project** invariant (re-points `iab__Project__c` to the target release's project, or refuses a cross-project move with a clear message). "Move to backlog" = transfer to the backlog Release. | v1 |
| `imhotep_update_release(release, <writable fields…>, org?)` | Update any writable Release field (status, dates, points goal, backlog flag, and rich-text description/Release Notes `iab__Notes__c` — Markdown in, HTML out). | v1 |
| `imhotep_create_task(story, subject, description?, status?, due_date?, org?)` | Create a **standard Salesforce Task** related to a Story (`WhatId` = Story). Optional feature; note Tasks are hidden on the **Simple** record-type layout. | v1.1 |
| `imhotep_log_metadata_change(story, component_api_name, metadata_type, change_type="Modified", notes?, org?)` | *Story-related write.* Record that a metadata component changed under a Story — creating/reusing the Metadata Component and creating the Metadata Component Change (junction). Great for AI build loops. | v1.1 |
| `imhotep_create_test_scenario(story, description?, instructions?, expected_result?, org?)` | *Story-related write.* Create a Test Scenario under a Story. | v1.1 |
| `imhotep_record_test_result(story, test_scenario?, result, status?, notes?, org?)` | *Story-related write.* Record a Test Result (Pass/Fail + status) against a Story/Scenario. | v1.1 |
| `imhotep_attach_file(target, target_id_or_number, file_path?, content?, title, org?)` | Attach a file (e.g. a Claude-generated Markdown plan) to a Project/Release/Story as a Salesforce File (ContentVersion + link). | later |
| `imhotep_tag_story(story, tag, org?)` | Apply a Tag to a Story (Tag Assignment); create the Tag under the Project if needed. | later |
| `imhotep_post_chatter(target, target_id_or_number, message, org?)` | Post a Chatter comment/feed item on a record. | later |

**Deliberately *not* in scope (any phase, unless we revisit):** creating/deleting Projects or
Releases; bulk import; deleting records. These stay UI/Data-Loader operations.

**Config-management tools** — so the customer can change their own defaults by *talking to
Claude*, without hand-editing JSON or granting the agent filesystem access to `~/.imhotep`
(§7.1). The **server** performs the file I/O; the agent just calls a verb.

| Tool | What it's for | Phase |
|---|---|---|
| `imhotep_get_config(scope?)` | Show current settings — the merged **effective** config, or a specific scope (`global`/`project`). Read-only. | v1 |
| `imhotep_set_config(key, value, scope="global"\|"project")` | Update a setting (`currentRelease`, `defaultProject`, `defaultOrg`, `autonomousMode`, …). Server **validates** the value (resolves the project/release/org first), **previews + confirms**, then writes to the chosen scope. **Auto-creates** the target file if absent. Edits in place to preserve JSONC comments. | v1 |
| `imhotep_init_config(scope="project"\|"global")` | Scaffold a documented, commented **starter** config at the chosen scope — the conversational twin of `npx imhotep-mcp init`. **No-clobber** (won't overwrite an existing file). Use to "set up Imhotep config for this project." | v1 |

Two notes: (1) `set_config` auto-creates the file, so a customer can just start setting values;
`init_config` is for scaffolding the fully-documented template up front. (2) **Scope &
permissions:** a **project** config is written into the current workspace (cwd) — no special
filesystem grant needed; only **global** writes touch `~/.imhotep`, and those are performed by
the server (§7.1). Config tools are **in v1** — `set_current_release` / `set_default_project`
are what make the working-context feature (§5.5, §7.5) usable without hand-editing a file.

### 5.3 Documentation tool (Resource Hub)

| Tool | What it's for | Phase |
|---|---|---|
| `imhotep_search_docs(query, limit=5)` | Search Imhotep's help/best-practice content so the AI can answer product/process questions accurately with citations. | v1.1 (pending Resource Hub config) |

**Confirmed:** all Resource Hub content is delivered as **Salesforce Knowledge articles** on an
Experience Cloud site in Imhotep's *support* org (a different org from the customer's install).

**Chosen mechanism (Option A): the live guest Support Knowledge REST API.** Salesforce's Support
Knowledge REST API (`/services/data/vXX.X/support/knowledgeArticles`, v38.0+) lets **guest
users** retrieve and search visible articles — **no customer auth, no cross-org token needed**.
The server calls the Resource Hub site's guest endpoint directly; content is always fresh with
no bundling/sync step. (A bundled offline index was considered and set aside for now.)
Refs: [Support Knowledge with REST API](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_knowledge_support.htm),
[Enable Knowledge in Experience Cloud](https://help.salesforce.com/s/articleView?id=experience.networks_knowledge_access.htm&type=5).

**Vendor action item (gates this tool):** the Resource Hub org must be configured for guest
Support-API access — enable the *"Guest Access to the Support API"* preference on the site and
give the guest profile read on the Knowledge article type/channel. Until that's done,
`imhotep_search_docs` can't ship; it's **decoupled from the record tools**, so v1 record work
proceeds regardless (this tool is a v1.1 fast-follow). **Build-time check:** measure actual REST
latency against the guest endpoint (the observed slowness is *browser* SPA rendering, which says
little about a single REST call).

### 5.4 Related data on `imhotep_get_story` (the `include` option)

`include` selects how much related context to pull with a Story. **Three distinct levers govern
it — keep them separate:**

1. **Capability (shipped in version) — the `Phase` column below.** Whether an `include` option
   *exists at all* depends on what the installed MCP version implements. A capability that
   hasn't shipped can't be enabled by any config. This is fixed by the version installed.
2. **Default-when-omitted — set in `imhotep.config.json`.** Among the options that *do* exist,
   which are pulled automatically when the caller doesn't pass `include`. The customer tunes
   this once (see §7); each option also has a **shipped default** (the `Default?` column) used
   when the customer hasn't overridden it.
3. **Per-call selection — the `include` argument.** The AI/subagent overrides for a single call
   (e.g. `include: ["bodies","tests","files"]`).

**Precedence when resolving what to fetch:** per-call `include` arg → customer's config default
set → shipped default (`Default?` below).

| `include` value | Returns | Source | Phase (shipped in) | Default? (shipped) |
|---|---|---|---|---|
| `bodies` | The four rich-text fields, HTML→Markdown | Story | v1 | ✅ on |
| `children` | Child Stories (via `Parent_Story__c`) | Story self-hierarchy | v1 | ✅ on |
| `tags` | Applied Tags | Tag Assignment | v1 | ✅ on |
| `metadata_changes` | Logged metadata component changes | Metadata Component Change | v1.1 | off |
| `tests` | Test Scenarios + Results | Test Scenario / Result | v1.1 | off |
| `tasks` | Related standard Salesforce Tasks | Task (`WhatId`) | v1.1 | off |
| `files` | Attached Salesforce Files | ContentDocumentLink | later | off |
| `notes` | Attached Notes | ContentNote | later | off |
| `chatter` | Chatter feed items + comments | FeedItem / FeedComment | later | off |

So "what's on by default at install" = the ✅ shipped defaults (unless the customer's config
changes them); "what a later release adds" = new rows become *available* (Phase), each with its
own shipped default the customer can then re-tune. The same `include` model (and config default
set) applies to `get_project` and `get_release`, each with its own option set — notably
`get_project` offers `releases`, **`resources`** (Resource Links, optionally filtered by type),
`metadata_components`, and `members`; `get_release` offers `stories`. (Listing a Project's
Resource Links is done via `get_project(include: ["resources"])` rather than a standalone tool.)

*Record-type note:* on **Simple**-record-type Stories, Child Stories and Tasks are hidden from
the Imhotep page layout (they're a Standard-story concept). The API doesn't enforce that
UI-layout choice, so `children`/`tasks` still work if requested — but the skill should treat
them as a Standard-story feature and not surface them by default for Simple stories.

### 5.5 Cross-cutting server behaviors
- **Record-reference resolution:** every record-identifying argument (`project`, `release`,
  `story`, `parent_story`, `target`, …) accepts any of: an **18/15-char Salesforce Id**; a
  pasted **record URL** (Lightning or Classic — the server parses the Id out of it); or the
  **human identifier** (name fragment, or normalized Story number `S-NNNNNN`). `get_*` tools
  resolve to exactly one record (returning candidates on an ambiguous miss); `list_*` tools
  short-circuit to a direct fetch when handed an Id/URL, otherwise search/filter by their
  arguments. *v1.1 niceties:* parse the **My Domain** from a Lightning URL to help
  resolve/confirm the target org; validate a pasted Id's **key prefix** against the expected
  object (via cached describe) to catch a wrong-object paste with a clear message. This resolver
  applies to **every** Imhotep object — a single shared mechanism every record-taking tool uses,
  arriving with each tool as it ships (Project / Release / Story in v1; the rest as their tools
  land).
- **Org resolution precedence:** per-call `org` arg → (My Domain parsed from a pasted URL, if
  any) → project `imhotep.config.json` `defaultOrg` → project `CLAUDE.md` declaration → global
  `~/.imhotep/config.json` `defaultOrg` → error asking the user. (The one-time "which org?"
  *conversation* lives in the skill; for solo users the global config usually answers it.)
- **Working-context resolution (project / release):** tools that take an optional `project` or
  `release` (e.g. `list_stories`, `create_story`) fall back, when the caller omits them, to:
  per-call arg → project config `currentRelease` / `defaultProject` → global config
  `defaultProject` → ask. The record-reference resolver applies to the config values too
  (name, Id, or URL). This is what makes "what's in flight" work in a repo without restating
  the project or release.
- **Namespace:** server prepends the fixed `iab__` namespace to every API name (hard-coded, not
  configurable); tool inputs stay namespace-free.
- **Rich text:** Markdown↔HTML both directions.
- **Verify-after-write:** write tools re-query and return persisted state (including the
  assigned `S-NNNNNN`).

---

## 6. Security & permissions

**The server acts as the authenticated Salesforce user** (via the `sf` CLI session for the
resolved org). This is the whole security model, and it's the right one:

- **Salesforce enforces the running user's CRUD, field-level security, sharing, and
  record-type access on every SOQL read and every DML/REST write — automatically.** The server
  neither has nor needs elevated access; it cannot expose data or perform writes the user
  couldn't do themselves in the UI. A user without Create on Story simply gets a create failure.
- **So we do *not* build a parallel permission model.** Instead the server **translates access
  errors** (`INSUFFICIENT_ACCESS_OR_READONLY`, FLS errors, `FIELD_FILTER_VALIDATION_EXCEPTION`,
  etc.) into plain-language messages naming the object, field, and org — so the user understands
  *why* and *where*. (Salesforce is the enforcement point; the server just makes its refusals
  legible.)
- **Confirmation is separate from permission.** Platform permissions decide what the user
  *can* do; the skill's confirm-before-write discipline decides what they *should* do right
  now (production data). Both apply.
- **Autonomous-write toggle (`autonomousMode`, default OFF).** Interactive use relies on the
  skill's confirm-before-write step, but a subagent/automation (§1) may call a write tool with
  no human present. `autonomousMode` in config governs this: **off by default**, meaning the
  posture is human-confirmed writes. A customer who wants to wire write tools into unattended
  subagents must **deliberately opt in** by setting `autonomousMode: true` (global or project).
  The server reads the flag and can warn/annotate when writes occur under it, so unattended
  writes are always an explicit, auditable choice — never the default.
- **Token hygiene:** the server never prints access tokens; tokens live only in the
  server process and are obtained fresh from the `sf` CLI per session.

---

## 7. Configuration — `imhotep.config.json` (what it is, and how it's handled)

*This section is intentionally detailed — the config file is the least obvious piece.*

### 7.1 What it is — and where it lives
A small JSON file that tells the server the specifics of a customer's Imhotep setup — a settings
override sheet. It can live at **two scopes**, and the server reads both (most-specific wins):

- **Global (per user):** `~/.imhotep/config.json` — personal settings that are the same across
  *all* of a user's projects. For a developer who points every project at one Imhotep
  production org, this is the natural home: set `defaultOrg` (and any custom fields) once and
  every project inherits it. Not tied to a repo; not committed. **The common case for solo
  users.**
- **Project (per repo):** `./imhotep.config.json` in the project root — optional, committable,
  shareable with a team, and **overrides** the global for that one project. Use it when a
  specific project targets a *different* Imhotep org, or a team wants pinned settings in version
  control.

Client-agnostic path (`~/.imhotep/`, not a Claude-specific folder) because the server serves any
MCP client — and it keeps the server's settings independent of any single client's directory
(e.g. a Claude reinstall never disturbs it). Both files are optional — with neither, the server
runs on baked-in defaults.

**Global-config lookup order:** `IMHOTEP_CONFIG` env var (explicit path, if set) →
`$XDG_CONFIG_HOME/imhotep/config.json` → `~/.imhotep/config.json`. The env override is handy for
CI/testing or non-standard dotfile setups; the XDG path honors the standard CLI-config
convention on macOS/Linux.

**Who reads *and writes* it — the server, not Claude.** The config is the *server's* input and
output. A stdio MCP server is a normal subprocess running as the user, so it reads these files
via plain file I/O — **not** through the AI client's tool layer or sandbox. The mechanism works
whether or not the AI agent has filesystem access to `~/.imhotep`, and config values (org
aliases, field maps) never need to enter the model's context.

To *change* settings, the customer talks to Claude and Claude calls the **config-management
tools** (`imhotep_get_config` / `imhotep_set_config` — §5.2); the **server** performs the write,
so the agent still needs **no** direct filesystem access to `~/.imhotep`. (Direct hand-editing —
or `imhotep config set …` in a terminal — remains available for anyone who prefers it, and *that*
path is the only one that would require granting the agent read/write access to the folder.)
*(Managed/hardened deployments that sandbox the server process itself must grant that process
read/write access to the config path — a server-process concern, separate from the agent's tool
permissions.)*

**Config precedence (deep-merged, most specific wins):** shipped package defaults → global
(`~/.imhotep/config.json`) → project (`./imhotep.config.json`) → per-call tool arguments.

**Which do you actually need? (Global is the norm.)** Most config keys describe the *org's
Imhotep install* — namespace, custom fields, picklists, record types — **not the project**, so
they're naturally global: set once, every project inherits them. A **project** file earns its
keep in only two situations: (a) a project that targets a *different* Imhotep org than your
global default (e.g. a client engagement), or (b) a **team** that wants shared settings
committed to the repo so teammates don't each configure a global file. A solo developer with
one Imhotep org typically needs only the global file. Project files are created **on demand**
(`npx imhotep-mcp init`, any time — not tied to install) or simply **pulled from git** when a
teammate committed one.

**Structural vs. behavioral — a clean split.** `imhotep.config.json` holds **structural facts
the server parses** (which org, field API names, picklist values, record types). **Behavioral
guidance the model interprets** — "we skip the Testing status," "tag Defects with 'triage,'"
"'the backlog' means release R-Backlog" — belongs in project `CLAUDE.md` or memories, at the
user's discretion, **not** in config.json. Config is for the machine; CLAUDE.md is for the model.

### 7.2 Why it's needed at all (given we target the managed package)
The server ships with a **baked-in default configuration** describing the managed package
exactly — namespaced object/field names, the real picklist values, record types, the
`Release_Mode` set. **For a stock managed-package install, the defaults are correct and the
customer may not need a config file at all** beyond telling the server which org to use.

A config file becomes useful because Imhotep is extensible and customers differ:
- They run Imhotep in a **specific org** and want the AI to default to it (`defaultOrg`).
- An admin **added custom fields** to a managed object (subscribers can add their own fields to
  managed objects) and wants the AI to read/write them.
- An admin **added picklist values** (e.g. a "Won't Fix" status) the AI should recognize.
- They prefer a **different default** record type or status.

### 7.3 How it's handled across the lifecycle

The key mental model: **defaults live *inside* the package (shipped, updated); overrides live
in the customer's *project* (theirs, never touched).** An MCP server run via `npx` does not
write files into the customer's project on install, so starter override files are delivered by
an **explicit, opt-in scaffold command**, not a magic install hook.

**On install:** nothing required — the server works immediately using its **baked-in
defaults** (the real managed-package schema). A config file is optional. The one thing most
customers *will* set is the target org — via `imhotep.config.json` `defaultOrg` *or* a line in
their project `CLAUDE.md` (the skill walks them through this once).

**Optional bootstrap — two equivalent paths:** for customers who know they'll customize, a
one-time scaffold writes a **documented, commented starter `imhotep.config.json`** (and,
optionally, an `imhotep-custom/` skill stub — §4.3):
- **In conversation:** the `imhotep_init_config(scope)` tool (§5.2) — no terminal needed.
- **In a terminal:** `npx imhotep-mcp init` (project-level) or `--global` for `~/.imhotep/`.

Both **refuse to overwrite** an existing file, so they're safe to run and re-run. (And since
`imhotep_set_config` auto-creates the file, a customer can also skip scaffolding and just start
setting values.) **`init` also places the *shipped* skill** into `~/.claude/skills/imhotep/`
(no-clobber) and scaffolds the starter **global** `~/.imhotep/config.json` — it is the single
delivery vehicle for the skill, since an `npx` MCP install can't place a skill into a client
(full rationale in §0). This is distinct from the optional customer-owned `imhotep-custom/` stub
above.

**Post-install customization:** the customer edits **their own** `imhotep.config.json` (and
optional custom skill) and sets only the keys they need to change. They never edit anything
inside the shipped package.

**On update:** updating the server package (`npm`/`git pull`) **replaces the baked-in
defaults** (so schema corrections and new tools arrive) but **never touches the customer's
`imhotep.config.json` or custom skill** — those live in their project, outside the package. At
runtime the server **deep-merges the customer's file over the shipped defaults**: any key the
customer set wins; everything else falls back to the (freshly updated) defaults. Result:
customers get engine/schema updates *and* keep their overrides, with no merge conflicts.

**Adopting new options after an update:** the package ships a `config.default.json` (the full
current defaults) and the base skill in plain view, so a customer who wants to pick up newly
added options just **diffs their file against the latest shipped version** and copies over what
they want. Re-running `init` can also emit a fresh `*.example` file to diff against. We never
merge into their files for them.

### 7.4 Shape (illustrative — customer writes only the keys they override)

```jsonc
{
  "defaultOrg": "acme-prod",       // the org where Imhotep is installed (alias)
  // (namespace is fixed at iab__ in the server — not a config key)

  "autonomousMode": false,         // default OFF; when true, permits unattended writes (§6)

  // Default WORKING CONTEXT (record-reference resolver applies: name, Id, or URL — §5.5).
  // Lets list/create tools assume a project/release when the caller omits them.
  "defaultProject": "GPS Accelerators",  // often global (your most-common project)
  "currentRelease": "R-2026.08",         // typically PROJECT-level; changes as the build advances

  // Custom fields the customer ADDED to managed objects, exposed to the AI by logical name:
  "customFields": {
    "story": { "sprint": "Acme_Sprint__c", "riskLevel": "Acme_Risk__c" }
  },

  // Extra picklist values an admin added (merged with the shipped set):
  "picklists": {
    "story.status": { "add": ["Won't Fix"] }
  },

  // Preference overrides:
  "recordTypes": { "story": { "default": "Simple" } },

  // Default related-data pulled when a get_* caller omits `include` (§5.4).
  // Only options the installed version actually ships can be listed here;
  // a per-call `include` argument still overrides these.
  "defaults": {
    "getStory":   { "include": ["bodies", "children", "tags"] },
    "getRelease": { "include": ["stories"] },
    "getProject": { "include": ["releases"] }
  }
}
```

**On `defaults` vs. capability:** listing an `include` option here only changes whether it's
pulled *by default* — it cannot enable a capability the installed MCP version doesn't ship
(§5.4, lever 1). If a customer lists an option their version doesn't support, the server ignores
it (and can warn), rather than erroring.

The server also carries **shipped, non-customer keys** in its defaults — the read-only field
list and the Story `Project = Release.Project` invariant — so there is a single schema source of
truth. Customers don't normally touch those.

### 7.5 Worked example — global + project together (multi-org)

A real multi-org setup like the author's: an internal org for GPS Accelerators / POC builds, and
a separate org where Imhotep is installed for the Haymarket Food Pantry.

**Global** `~/.imhotep/config.json` — your most-common context, inherited everywhere:
```json
{
  "defaultOrg": "gps-internal",
  "defaultProject": "GPS Accelerators"
}
```

**Project** `./imhotep.config.json` in the Haymarket repo — overrides for this build only:
```json
{
  "defaultOrg": "haymarket-pantry",
  "defaultProject": "Food Pantry Operations",
  "currentRelease": "R-2026.08"
}
```

**Effect:**
- In the **Haymarket repo**, "what's in flight" / "create a story" default to *Food Pantry
  Operations · R-2026.08* in the *haymarket-pantry* org — no restating context.
- In **any other project**, you fall through to the global *GPS Accelerators · gps-internal*
  context.
- A **per-call override always wins** — "show stories in release 11.3 in gps-internal" ignores
  both files for that one call.
- `currentRelease` is updated in the project file as the build moves from one release to the
  next (by hand, or a future `imhotep set-release` helper).

This is exactly case (a) from §7.1 (different Imhotep org per project) plus the working-context
class — the reason a multi-org user keeps per-repo config files even though the *schema* keys
stay global.

---

## 8. The skill

A **new** shipped skill (distributed with the server) whose entire job is to make an AI client
use the tools well. Contents:

- **Tool map:** intent → tool (open a story → `imhotep_get_story`; what's in flight →
  `imhotep_list_stories`; list a project's releases → `imhotep_list_releases`; mark a story Ready
  → `imhotep_update_story(status=…)`; log a metadata change → `imhotep_log_metadata_change`;
  etc.).
- **Story field semantics:** the high-value editorial guidance no tool can enforce — Description
  is a *short* user story; implementation detail → Solution Build Notes; acceptance criteria in
  their own field; Deployment Checklist = only manual deploy steps not covered by Work Item
  promotion. Uses the **real** managed-package picklists (`Status`: Blocked/Defined/Building/
  Testing/Ready/Deployed; `Type`: New/Change/Defect).
- **Confirm-before-write** discipline; **target-org resolution** conversation.
- **Rich text authored in Markdown** (the server converts).
- **Shipped-vs-yours boundary** (§4.3) so customization lands in the right files.

No SOQL, no REST recipes — those are the server's responsibility.

### 8.1 Voice & theming (optional, cost-aware)

Imhotep's ancient-Egypt theme (Imhotep, builder of the Step Pyramid of Djoser at Saqqara) can
carry into the product's tone — but under one rule: **boring machine contract, flavored human
edges.** Tone never touches anything a machine parses or that loads into model context every
session.

- **Never themed** (protects composability *and* the context budget): tool names, input/output
  schemas, field names, **tool descriptions**, and the **skill's instructions** — the last two
  load into context on every session, so flavor there is a real recurring token tax and can
  muddy tool routing. The substantive part of error messages stays literal so subagents can
  parse it.
- **Safe to flavor** (human-facing, ~zero recurring model-context cost): README / CHANGELOG /
  docs prose and section names; the `npx imhotep-mcp init` console output and the comments
  inside generated starter files; the server's one-line **startup banner** (stderr — humans see
  it, the model doesn't); major-release **codenames** drawn from the theme.
- **Opt-in only** where it could bleed into Claude's user-facing replies: one light framing line
  in the skill is fine; a themed *speaking voice* when talking to the user is a toggle the
  customer enables in `imhotep.config.json` / CLAUDE.md, so it never imposes on those who don't
  want it.

Restrained examples: a README epigraph; `init` printing `Laying the foundation stones…`; a
stderr banner at launch; majors codenamed from the theme (Djoser, Saqqara…) alongside the real
semver.

---

## 9. Packaging, distribution & updates

- **Server repo — REQUESTED: `SalesforceLabs/Imhotep-MCP`.** Mitch has asked the Salesforce
  Labs team to create a **new, separate repo** to host the MCP server, so it can be managed as
  its own product rather than mixed into `SalesforceLabs/Imhotep-App-Builder` (which hosts the
  app source). This keeps MCP versioning/CHANGELOG independent of the app package's release
  cadence.
  - **Interim repo (in use now): `SFDC-Assets-emu/Imhotep-MCP`** (private). Until the Labs repo
    is provisioned, development happens in a temporary repo in the `SFDC-Assets-emu` org (where
    Mitch is a sysadmin), so version control is in place from day one. When
    `SalesforceLabs/Imhotep-MCP` lands, the history migrates over (add the new remote, push
    `main` + tags, transfer issues/settings, then retire the interim repo). The npm package name
    (`imhotep-mcp`, unscoped) is unaffected by the repo move.
- **npm — account already created: `sf-mitch-lynch`; package name `imhotep-mcp` (unscoped).**
  Command stays `npx imhotep-mcp`. Unscoped means ownership can later be transferred to or
  co-owned with SalesforceLabs **without a rename** (no breaking change to the install command);
  only moving to an `@salesforcelabs/` scope would break it, so we stay unscoped. Provenance is
  conveyed via the repo + README. **Action (Increment 5):** confirm `imhotep-mcp` is free on
  npm before first publish.
- **Language/SDK:** TypeScript + `@modelcontextprotocol/sdk` (cleanest `npx`).
- **`package.json`** with `"bin": { "imhotep-mcp": "dist/server.js" }` → enables `npx imhotep-mcp`.
- **Registration:** committed `.mcp.json` for zero-config auto-discovery:
  ```jsonc
  { "mcpServers": { "imhotep": { "command": "npx", "args": ["-y", "imhotep-mcp@1"] } } }
  ```
- **Prerequisites** (documented in the README):
  1. **Imhotep App Builder installed** — the managed package from the AppExchange, installed in
     the Salesforce org where Projects/Releases/Stories live. This is the foundational
     prerequisite: no package, nothing to operate on. (The server targets the namespaced managed
     package by default — §Framing.)
  2. **`sf` CLI installed and authenticated** to that org — this is how the server authenticates
     and how the user's permissions are enforced (§6).
  3. **Node.js** (for `npx imhotep-mcp`).
  4. **An MCP client** (Claude Code / Claude Desktop / other).

  *(Not a customer prerequisite: the guest Support-API setting for docs-search Option A is
  configured by the Imhotep team on the Resource Hub site, not by the subscriber — §5.3.)*
- **Update patterns:** (1) `npx -y imhotep-mcp@1` auto-fetches latest within the major (pin
  `@1.2.3` to freeze); (2) git clone + `git pull` + `npm install` + restart. Semver + visible
  `CHANGELOG.md`; breaking schema changes gated behind a new major (`@2`) customers opt into.

---

## 10. Open questions & build-time checks

No open scope decisions — the design is settled and reflected in §§1–9. What remains are
verification tasks to complete during the build:

- **Resource Hub guest Support-API config** — enable the guest preference + article-type read on
  the support site, and measure guest REST latency. Gates `search_docs` (§5.3); does not block
  the record tooling.
- **Live picklist confirmation** — verify `iab__Status__c` / `iab__Story_Type__c` values against
  a real org (they're baked into the server's shipped defaults).

---

## 11. Proposed phasing

- **Increment 0 — Plan finalize.** This doc + final sign-off. Engineering decisions locked in §0
  (data access via `sf` token + `jsforce`; rich-text/config libraries; skill+global-config
  delivery via `init`; verification against the available managed `iab__` org). *(complete —
  awaiting sign-off)*
- **Increment 1 — Server skeleton.** `package.json`, `.mcp.json`, config loader (defaults +
  deep-merge), `sf`-CLI auth, namespace/apiVersion plumbing, error translation (§6). Prove
  `imhotep_get_story` end-to-end.
- **Increment 2 — v1 read/navigation.** `list_projects` (query/status) / `get_project`
  (incl. `resources`) / `list_releases` (+ `is_backlog`) / `get_release` / `get_story` /
  `list_stories` / `search`; HTML→Markdown; story-number normalization + fallback probe;
  record-reference resolver; `get_story` includes **bodies/children/tags** (all on by default).
- **Increment 3 — v1 writes.** `create_story` (Project derivation, Markdown→HTML, child
  stories), `update_story` (incl. the `status` field), `transfer_story`, `update_release`
  (incl. Release Notes `iab__Notes__c`); read-only-field refusal; verify-after-write;
  `autonomousMode` gating (default off).
- **Increment 4 — Config-management tools.** `get_config` / `set_config` / `init_config`;
  global + project scopes; deep-merge precedence; working-context resolution.
- **Increment 5 — Skill.** Author the shipped skill per §8 (tool map, field semantics, confirm
  discipline, shipped-vs-yours boundary, voice §8.1). **Install & prove locally:** place the
  shipped skill into `~/.claude/skills/imhotep/` (the slot freed by the prototype rename) and
  confirm it triggers and drives the v1 tools correctly against the verification org.
  **Decommission the prototype (gated on that proof):** once the shipped skill is confirmed
  working, remove `~/.claude/skills/imhotep-prototype/` and any residual references to it, so the
  built product fully replaces all evidence of the prototype. *(Cross-Claude references outside
  this repo — CLAUDE.md, memories — are maintained separately by the author; this increment owns
  the skill-directory cleanup and flags anything else it notices for that separate effort.)*
- **Increment 6 — Package & publish (v1).** README (prereqs incl. managed-package install +
  `sf` CLI), `CHANGELOG.md`, versioning, `.mcp.json`, `config.default.json`,
  `npx imhotep-mcp init`; confirm npm name; first publish.
- **v1.1 (fast-follow).** Read depth (`get_story` `tests`/`metadata_changes`/`tasks` includes);
  standalone read tools (`list_metadata_components`, `list_metadata_changes`, `get_story_tests`);
  Story-related writes (`log_metadata_change`, `create_test_scenario`, `record_test_result`) +
  `create_task`; `search_docs` (once Resource Hub guest-API config + latency are verified);
  record-reference My-Domain/key-prefix niceties.
- **Later (post-v1.1).** Files (`attach_file` + `files`/`notes` includes), Tag writes
  (`tag_story`), Chatter (`post_chatter` + `chatter` include).

Each increment: build → verify → review → sign-off gate. No deploy/publish without explicit
approval.

---

## 12. Out of scope
- Creating/deleting Projects and Releases; deleting any records.
- Bulk imports (Data Loader / Workbench / `sf data import bulk`).
- A parallel permission system (Salesforce enforces the user's access — §6).
- Hosting anything remotely (local stdio only).

---

## Appendix — Imhotep object model (reference)

Source: `SalesforceLabs/Imhotep-App-Builder`, `force-app/main/default/objects/*.object`
(legacy single-file MDAPI format). 14 objects: 13 custom (`__c`) + 1 CMT (`__mdt`). The
**managed package namespaces all of these with `iab__`** (e.g. `iab__Story__c`) — this is the
fixed namespace the server targets. (Field API names in this appendix are shown un-prefixed for
readability; the server prepends `iab__`.)

**Hierarchy:** `Project → Release (MD) → Story (MD)`. Story is the hub — master to Metadata
Component Change, Tag Assignment, Test Scenario, Test Result; self-lookup via `Parent_Story__c`;
denormalized `Project__c` lookup + `Requested_Release__c` lookup.

**Objects:** `Project__c`, `Release__c`, **`Story__c`** (primary artifact), `Metadata_Component__c`,
`Metadata_Component_Change__c` (junction: Story↔Metadata Component), `Test_Scenario__c`,
`Test_Result__c`, `Project_Member__c`, `Resource_Link__c`, `Tag__c`, `Tag_Assignment__c`
(junction: Story↔Tag), `Template__c`, `Template_Item__c`, `Imhotep_Config__mdt` (app config CMT —
not CRUD data).

**Story__c** — Name field "Title"; `Story_Number__c` auto-number (`S-NNNNNN`); record types
`Simple`/`Standard`.
- Rich text: `Story_Description__c` (short user story), `Acceptance_Criteria_Tests__c` (DoD +
  tests), `Solution_Build_Notes__c` (implementation notes — most body content),
  `Deployment_Checklist__c` (manual deploy steps not covered by Work Item promotion).
- `Status__c`: `Blocked | Defined | Building | Testing | Ready | Deployed`.
- `Story_Type__c`: `New | Change | Defect`.
- Relationships: `Release__c` (MD, required), `Project__c` (lookup, must = Release.Project),
  `Parent_Story__c` (self-lookup), `Requested_Release__c` (lookup), `Assigned__c` (→ Project_Member).
- Numbers: `Points__c`, `Estimated_Points__c`, `Actual_Points__c`, `Priority_Order__c`.

**Release__c** — Name "Release"; record types `Simple`/`Standard`. `Project__c` (MD, required);
`Status__c` (`Planning | Active | Accepted`); `Release_Mode__c` (`Standard`/`Simple`);
`Is_Backlog__c`, `Start_Date__c`, `Release_Date__c`; `Points_Goal__c`, `Points_Available__c`;
rollups `Total_Points__c`, `Points_Left_to_Complete__c`; `Notes__c`, `Description__c`.

**Project__c** — Name "Project Name". `Status__c` (`Planning | Active | Completed`); `Type__c`
(Demo Build / Implementation / ISV Build / …); `Default_Release_Mode__c`; `Description__c`;
rollups `Release_Count__c`, `Resource_Link_Count__c`.

**Ancillary:** `Metadata_Component__c` (Project catalog; `Metadata_Type__c` ~150 values,
`Category__c` Custom/Standard/Managed, self-hierarchy); `Metadata_Component_Change__c`
(`Change_Type__c` New/Modified/Deleted); `Test_Scenario__c` (`Status__c` Not Ready/Ready/
Completed); `Test_Result__c` (`Result__c` Pass/Fail; `Status__c` Assigned→Closed);
`Resource_Link__c` (`Type__c` Figma/GitHub/Google/Slack/…); `Project_Member__c` (`Role__c`
Owner-Lead/Builder/Viewer, → User); `Tag__c`/`Tag_Assignment__c`; `Template__c`/`Template_Item__c`
(standalone reusable "story blueprints," not under Project).

**Global value set `Release_Mode`:** `Standard` (default) | `Simple`.

**Do-not-write (system-maintained):** auto-numbers (`Story_Number__c`, `C{000000}`, `TS-`, `TR-`),
rollups (`Total_Points__c`, `Points_Left_to_Complete__c`, counts), formulas
(`Assigned_to_Current_User__c`).

---

## Changelog

- **2026-08-02 — Prototype decommission.** Prototype skill renamed to `imhotep-prototype`
  (parallel cross-Claude effort by the author, outside this repo), freeing the `imhotep/` slot.
  Updated the Kickoff note accordingly and added to **Increment 5**: install the shipped skill
  into `~/.claude/skills/imhotep/`, prove it locally, then remove `imhotep-prototype` and residual
  references so the built product fully replaces the prototype. Skill-directory cleanup is owned
  here; cross-Claude references (CLAUDE.md, memories) are handled in the author's separate effort.
- **2026-08-02 — Review round (inline comments).** Trimmed the v1 tool surface 19 → 14 after a
  tool-by-tool review: merged `find_project` into `list_projects(query?, status?)`; cut
  `find_release` (release search is only meaningful within a project — `list_releases`/`get_release`
  cover it); cut `update_status` (folded into `update_story`'s `status` field); cut
  `update_release_notes` (folded into `update_release`'s rich-text handling); folded
  `list_resources` into `get_project(include:["resources"])`. Flipped the `get_story` `tags`
  include to **on** by default. Removed the optional v1.1 preflight permission-check (redundant
  with error translation, adds latency). Reconciled §4.1 to **`jsforce`** (was still describing a
  `fetch` wrapper — contradicted §0). Removed the redundant §5.6 v1-scope summary. Named the
  verification org (**GPS Accelerators production**) and flagged production write-testing stakes.
  Recorded the interim `SFDC-Assets-emu/Imhotep-MCP` repo + migration path in §9.
- **2026-08-02 — Increment 0 finalize.** Status → *Final — awaiting sign-off*. Added §0 recording
  locked engineering decisions (data access via `sf org display` token + `jsforce`; session-expiry
  re-auth; apiVersion capping; rich-text via `markdown-it`/`turndown`; config via `jsonc-parser`
  with atomic writes; record-type caching). Resolved the §4.2/§8 skill-delivery gap: `init` /
  `imhotep_init_config` places the shipped skill into `~/.claude/skills/imhotep/` and scaffolds the
  global `~/.imhotep/config.json` (both no-clobber) — cross-referenced in §7.3; noted a future
  Claude Code plugin as roadmap. Confirmed a managed `iab__` verification org is available (live
  §11 acceptance stands). Grounded the guest Support Knowledge REST API (§5.3) and `sf` CLI
  access-token pattern (§6) against Salesforce docs. No scope changes to §§1–12.
