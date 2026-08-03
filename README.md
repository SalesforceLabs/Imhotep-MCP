# Imhotep MCP Server

> **Status:** In active development toward v1. Capabilities marked _(coming in v1)_ below are on
> the way; this README will fill in as they land.

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
   (managed package) installed in the Salesforce org where your Projects/Releases/Stories live.
2. **[Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`)** installed and
   authenticated to that org — this is how the server authenticates and how your permissions are
   enforced.
3. **[Node.js](https://nodejs.org) 18+** (to run via `npx`).
4. **An MCP client** (Claude Code / Claude Desktop / other).

## Getting started

_(Installation and MCP-client setup instructions coming in v1.)_

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

- _Configuration tools coming in v1 — see [Getting started](#getting-started) as they land._

## Configuration

_(coming in v1)_ Point the server at the org where Imhotep is installed and tailor its defaults —
set once globally, or per project. Details will be documented here as configuration lands.

## Development

```bash
npm install        # install dependencies
npm run typecheck  # type-check without emitting
npm run build      # compile TypeScript to dist/
npm test           # run the test suite
npm run lint       # lint
npm run format     # format with Prettier
```

## Repository layout

```
src/            server source
  config/       config loading + deep-merge (defaults -> global -> project)
  salesforce/   sf-CLI auth + Salesforce API access
  tools/        MCP tool definitions (one per user intent)
  util/         shared helpers (namespace, rich text, record references)
skill/          the shipped skill (judgment layer for AI clients)
tests/          test suite
```

## License

Apache-2.0. See [LICENSE.txt](LICENSE.txt).
