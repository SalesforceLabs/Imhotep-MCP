# Changelog

Release notes for `imhotep-mcp`, documenting the delivered product at each release.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Breaking schema/interface changes are gated behind a new major version (e.g. `@2`).

## [Unreleased] — 1.0.0 (pre-release; date set at publish)

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
