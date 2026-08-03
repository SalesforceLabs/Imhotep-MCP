# Imhotep MCP Server

> **Status:** v1, pre-release. The full v1 toolset is built and working; a public release (GitHub +
> npm) follows once the project completes its open-source review.

> _Laying the foundation stones…_

An [MCP](https://modelcontextprotocol.io) server that lets you work with your
**[Imhotep App Builder](https://github.com/SalesforceLabs/Imhotep-App-Builder)** data — Projects,
Releases, and Stories — from any MCP client (Claude Code, Claude Desktop, and others). Natural
requests like _"show me S-528 and its child stories"_ or _"mark S-528 as Ready"_ each resolve to
a single, reliable tool call, run **as the authenticated Salesforce user** so the platform
enforces your permissions.

The server targets the **managed** Imhotep package (namespace `iab__`), and ships alongside a
**skill** that teaches an AI client when and how to use the tools.

## Prerequisites

1. **[Imhotep App Builder](https://appexchange.salesforce.com/appxListingDetail?listingId=653308da-f440-4d28-8b6a-b7ed2a1394b3&tab=e)**
   (managed package, **v2.0.0 or later**) installed in the Salesforce org where your
   Projects/Releases/Stories live.
2. **[Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`)** installed and
   authenticated to that org — this is how the server authenticates and how your permissions are
   enforced.
3. **[Node.js](https://nodejs.org) 18+** (to run via `npx`).
4. **An MCP client** (Claude Code / Claude Desktop / other).

## Getting started

Once the project is publicly released, the simplest path will be zero-install via npm — register
the server with your MCP client and it fetches on demand:

```jsonc
// .mcp.json
{ "mcpServers": { "imhotep": { "command": "npx", "args": ["-y", "imhotep-mcp@1"] } } }
```

Until then (and any time you prefer to run from source), install from the repository:

```bash
git clone <repo-url> imhotep-mcp
cd imhotep-mcp
npm install
npm run build
```

Then point your MCP client at the built server:

```jsonc
// .mcp.json
{ "mcpServers": { "imhotep": { "command": "node", "args": ["/absolute/path/to/imhotep-mcp/dist/server.js"] } } }
```

Finally, scaffold your configuration and install the skill:

```bash
npx imhotep-mcp init          # or: node dist/server.js init
```

`init` writes a documented starter `imhotep.config.json` and installs the skill into
`~/.claude/skills/imhotep/` (both no-clobber — safe to re-run). Then set your org, e.g. by asking
Claude to run `imhotep_set_config defaultOrg <your-sf-org-alias>`.

## Tools

Each tool maps to a single intent. Inputs are human-friendly — a Story number, a name, a
Salesforce Id, or a pasted record URL all work wherever a record is expected — and results
respect your Salesforce permissions.

**Navigate & read**

- **`imhotep_list_projects`** — find or list Projects by name and/or status.
- **`imhotep_get_project`** — open a Project; optionally include its `releases` and `resources`
  (Resource Links).
- **`imhotep_list_releases`** — list a Project's Releases, with points, dates, and a backlog
  filter.
- **`imhotep_get_release`** — open a Release; optionally include its `stories`.
- **`imhotep_get_story`** — open a Story by number (e.g. `S000528`), Id, URL, or title fragment;
  includes its bodies (as Markdown), child stories, and tags by default. Returns close matches
  when the reference is ambiguous.
- **`imhotep_list_stories`** — the workhorse list ("what's in flight", "stories in release X"),
  with filters for release, project, status, type, assignee, parent story, and tag.
- **`imhotep_search`** — free-text search across Stories, Projects, or Releases when you don't
  have an exact name or number.

Rich-text fields (Story descriptions, Release notes) are returned as Markdown.

**Create & update**

- **`imhotep_create_story`** — create a Story under a Release; its Project is filled in
  automatically. Set a parent to create a child story. Write rich-text fields in Markdown.
- **`imhotep_update_story`** — change any writable field, including status (e.g. "mark S-528
  Ready").
- **`imhotep_transfer_story`** — move a Story to another Release (its Project stays consistent
  automatically); "move to backlog" transfers it to the backlog Release.
- **`imhotep_update_release`** — update Release fields, including Release Notes (written in
  Markdown).

Writes run as your Salesforce user, so your permissions and Imhotep's validation rules apply.
System-maintained fields (auto-numbers, rollups, formulas) can't be written. You author rich text
in Markdown; the server stores it as HTML.

**Configure**

- **`imhotep_get_config`** — show your current settings (merged, or a single scope).
- **`imhotep_set_config`** — set a value (`defaultOrg`, `defaultProject`, `currentRelease`,
  `autonomousMode`) at the global or project scope. Previews the change first; you confirm before
  it's written.
- **`imhotep_init_config`** — scaffold a documented starter config file.

Set a default org and project once, and the other tools assume them — so "what's in flight" or
"create a story titled …" just work without restating context each time.

## Configuration

Point the server at the org where Imhotep is installed and tailor its defaults. Configuration is
optional — the server runs on sensible baked-in defaults — but setting a default org and project
makes everyday requests context-free.

Settings live in an `imhotep.config.json` at either scope, most-specific winning:

- **Global** — `~/.imhotep/config.json`, inherited by every project (the common case).
- **Project** — `./imhotep.config.json` in a repo, overriding the global for that project.

You don't hand-edit these unless you want to: `npx imhotep-mcp init` (or the `imhotep_init_config`
tool) scaffolds a documented starter, and `imhotep_set_config` sets values for you (previewing
first). Common keys: `defaultOrg`, `defaultProject`, `currentRelease`, `autonomousMode`.

Behavioral guidance ("we skip the Testing status", "tag every Defect with 'triage'") belongs in
your project's `CLAUDE.md` or memories, not in `imhotep.config.json` — config is for structure the
server parses; `CLAUDE.md` is for guidance the model interprets.

## The skill

The server ships with a **skill** ([`skill/SKILL.md`](skill/SKILL.md)) — the judgment layer that
teaches an AI client *when and how* to use the tools: which tool fits a request, Imhotep's field
semantics (what belongs in Description vs. Solution Build Notes vs. Deployment Checklist),
confirm-before-write discipline, and where to put your own customizations. It contains no queries or
API recipes — those are the server's job.

`npx imhotep-mcp init` installs the skill for you; you can also copy `skill/SKILL.md` into
`~/.claude/skills/imhotep/` by hand.

## Compatibility & versioning

The server is versioned on its **own** semantic-version line (starting at **1.0.0**), independent
of the Imhotep App Builder managed package. This release targets **Imhotep App Builder v2.0.0+**.
Breaking changes are gated behind a new major version you opt into (pinning `imhotep-mcp@1` keeps
you on compatible minor/patch updates).

## Development

```bash
npm install        # install dependencies
npm run typecheck  # type-check without emitting
npm run build      # compile TypeScript to dist/
npm test           # run the test suite
npm run lint       # lint
npm run format     # format with Prettier
```

Maintainers: see [PUBLISHING.md](PUBLISHING.md) for the release runbook (publishing is gated on
open-source clearance).

## Repository layout

```
src/            server source
  cli/          CLI subcommands (e.g. `imhotep-mcp init`)
  config/       config loading, deep-merge, and comment-preserving writes
  salesforce/   sf-CLI auth, jsforce connection, queries, writes, error translation
  tools/        MCP tool definitions (one per user intent)
  util/         shared helpers (namespace, rich text, record references)
skill/          the shipped skill (judgment layer for AI clients)
tests/          test suite
config.default.json   shipped managed-package schema defaults
```

## License

Apache-2.0. See [LICENSE.txt](LICENSE.txt).
