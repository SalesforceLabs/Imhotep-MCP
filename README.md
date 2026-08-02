# Imhotep MCP Server

> _Laying the foundation stones…_

An [MCP](https://modelcontextprotocol.io) server that lets you work with your
**[Imhotep App Builder](https://github.com/SalesforceLabs/Imhotep-App-Builder)** data — Projects,
Releases, and Stories — from any MCP client (Claude Code, Claude Desktop, and others). Natural
requests like _"show me S-528 and its child stories"_ or _"mark S-528 as Ready"_ each resolve to
a single, reliable tool call, run **as the authenticated Salesforce user** so the platform
enforces your permissions.

The server targets the **managed** Imhotep package (namespace `iab__`), and ships alongside a
**skill** that teaches an AI client when and how to use the tools.

> **Status:** In active development toward v1.

## Prerequisites

1. **[Imhotep App Builder](https://appexchange.salesforce.com/appxListingDetail?listingId=653308da-f440-4d28-8b6a-b7ed2a1394b3&tab=e)**
   (managed package) installed in the Salesforce org where your Projects/Releases/Stories live.
2. **[Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`)** installed and
   authenticated to that org — this is how the server authenticates and how your permissions are
   enforced.
3. **[Node.js](https://nodejs.org) 18+** (to run via `npx`).
4. **An MCP client** (Claude Code / Claude Desktop / other).

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
