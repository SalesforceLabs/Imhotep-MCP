# Publishing `imhotep-mcp`

Release runbook for the maintainer. **Publishing to the public npm registry is a deliberate,
one-time-per-version, effectively irreversible action** (npm allows unpublish only within 72 hours
and with conditions; otherwise a version can only be deprecated). Do not publish casually.

## ⚠️ Gate: corporate Open Source clearance

**Do not run `npm publish` (or make the GitHub repo public) until the corporate Open Source review
has cleared this project.** Public npm publish is a public disclosure of Salesforce source, which
is exactly what clearance authorizes. Everything below is a dress rehearsal until clearance lands.

The public GitHub repo is the first-class distribution channel; **npm is an optional convenience**
(`npx imhotep-mcp`). Customers can use the product from the repo (clone + build) without npm.

## Pre-publish checklist

- [ ] OSS clearance granted (and confirm whether npm publish needs its own approval vs. the repo's).
- [ ] `npm run build` clean; `npm test` green; `npm run lint` clean; `npm run typecheck` clean.
- [ ] `package.json` `version` bumped per semver (independent of the managed package; see below).
- [ ] `CHANGELOG.md` has an entry for this version (delivered-product notes).
- [ ] README compatibility line current (Imhotep App Builder **v2.0.0+**).
- [ ] `npm pack` inspected — the tarball contains only intended files (see below).

## Verify WITHOUT publishing (do this every time first)

`npm pack` produces the *exact* tarball `npm publish` would upload, but saves it to disk:

```bash
npm run build
npm pack                       # → imhotep-mcp-<version>.tgz
tar -tzf imhotep-mcp-*.tgz     # inspect contents: dist/, config.default.json, skill/, README, CHANGELOG, LICENSE, package.json
npm install -g ./imhotep-mcp-*.tgz   # optional: real from-tarball install to smoke-test
```

The `files` allowlist in `package.json` controls what ships (`dist`, `config.default.json`,
`skill`, `README.md`, `CHANGELOG.md`, `LICENSE.txt`). Source (`src/`), tests, and dev config are
intentionally excluded.

## Publish (post-clearance only)

```bash
npm login                      # as the owning account (e.g. sf-mitch-lynch); one-time per machine
npm publish --access public    # unscoped public package; `prepublishOnly` re-runs clean build
```

Then verify: `npm view imhotep-mcp version` shows the new version, and `npx -y imhotep-mcp@1`
resolves.

## Versioning policy

- **Independent semver line.** `imhotep-mcp` is versioned on its own, **not** matched to the
  Imhotep App Builder managed package. v1 ships as **1.0.0**.
- **Compatibility, not matching.** State the managed-package floor in README/CHANGELOG
  (currently **Imhotep App Builder v2.0.0+**); bump it if a future MCP version needs newer package
  features.
- **Majors gate breaking changes.** Breaking schema/interface changes go in a new major (`@2`) that
  customers opt into; `.mcp.json` pins `imhotep-mcp@1` so minors/patches flow automatically.

## Ownership note

Package name is **unscoped** (`imhotep-mcp`) so ownership can later transfer to / be co-owned with
SalesforceLabs **without a rename** (the install command never changes). Moving to an
`@salesforcelabs/` scope *would* break the command, so stay unscoped.
