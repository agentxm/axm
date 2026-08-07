# Knowledge

Knowledge bundles live canonically in
`./.axm/extensions/<@owner>/knowledge/<name>`. Active bundles are discoverable
from a compact table in the canonical workspace instruction file.

A knowledge bundle is portable reference material — architecture notes, domain
vocabulary, runbooks — packaged as a tree of Markdown concept documents. Unlike
rules, bundle content is not injected into agent instructions. AXM adds only a
name, publisher description, and canonical link; bundle content is opened on
demand, without spending context on material the task does not need.

Bundles use [Open Knowledge Format
0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md),
the governing standard for this extension type. AXM validates the AgentXM
profile of that standard on lint and on publish.

## knowledge.json

[`knowledge.json`](https://axm.sh/schemas/knowledge.schema.json)

The manifest declares the OKF dialect and the bundle root:

```json
{
  "$schema": "https://axm.sh/schemas/knowledge.schema.json",
  "owner": "@acme",
  "type": "knowledge",
  "name": "platform",
  "version": "1.0.0",
  "format": { "name": "okf", "version": "0.2" },
  "bundleRoot": "src"
}
```

`format` pins the dialect AXM validates against, and `bundleRoot` is always
`src`. Run `axm help knowledge-schema` to print the raw JSON Schema.

## Package layout

```text
.axm/extensions/@acme/knowledge/platform/
├── knowledge.json
└── src/
    ├── index.md
    ├── log.md
    └── auth/
        ├── index.md
        └── session-management.md
```

`src/index.md` is the discovery root and is required. It carries the bundle's
`okf_version` in YAML frontmatter and at least one level-one heading:

```markdown
---
okf_version: "0.2"
---

# Platform knowledge

- [Session management](auth/session-management.md)
```

`index.md` and `log.md` are reserved names. Nested `index.md` files are section
indexes and must not carry frontmatter; `log.md` records change history under
`## YYYY-MM-DD` headings, newest first.

## Concepts

Every other Markdown file under `src/` is a concept. A concept's ID is its
bundle-relative path without the `.md` suffix, so
`src/auth/session-management.md` is opened as `auth/session-management`.

```markdown
---
type: reference
description: How platform sessions are issued, refreshed, and revoked.
tags: [auth, sessions]
---

# Session management

Sessions are issued at login and refreshed on the sliding window described
below.
```

- `type` is required — a concept without a non-empty frontmatter `type` fails
  validation.
- A level-one heading supplies the display title.
- `description` and `tags` drive search and are strongly recommended; lint
  warns when they are missing.

OKF provenance fields are validated when present: `sources`, `generated`,
`verified`, `status`, `stale_after`, and `resource`. Actors follow the OKF
convention — `<producer>/<version>`, `human:<id>`, or `process:<id>`.

## Authoring

Run `axm knowledge new <name>` to scaffold a bundle with its manifest and a
root index, then add concept files under `src/`.

Validate while you write:

```bash
axm knowledge lint --path ./.axm/extensions/@acme/knowledge/platform
```

Lint reports errors (missing root index, missing concept `type`, invalid
frontmatter, unsafe paths, broken internal links, detected secrets) and
warnings (missing description or tags, concepts unreachable from an index).
Errors exit non-zero; warnings do not.

## Install and update

`axm knowledge install <source>` (or the generic `axm install`) materializes
the bundle under `.axm/extensions/<owner>/knowledge/<name>/`, records it in
`.axm/axm-lock.yaml`, and refreshes the local concept index.

```bash
axm knowledge install @acme/knowledge/platform
axm knowledge update --preview
axm knowledge uninstall platform
```

## Instruction discovery

When instruction management is enabled, AXM writes one managed `Knowledge Base`
table to the canonical instruction source. Rows sort by owner and bundle name,
and link directly to each installed bundle's canonical `src/index.md`. Existing
instruction aliases continue to propagate from that canonical source.

Discovery is enabled by default. Disable only the table with:

```jsonc
{
  "knowledgeConfig": {
    "instructions": false,
  },
}
```

This does not uninstall, distrust, or disable Knowledge, and search/open remain
available. Global instruction ownership remains under `rulesConfig.instructions`;
when that setting is absent or false, Knowledge does not mutate instruction
files.

`axm sync` restores missing canonical content from exact locked registry
versions or pinned git trees, treats local and workspace sources as
authoritative, and reconciles the table without advancing versions. Use
`axm sync --preview` to preview table changes and conservative cleanup of legacy
AXM-managed Knowledge projections. Unknown files are preserved.

## Discovery

- `axm knowledge list` (`ls`) — installed bundles with concept and diagnostic
  counts.
- `axm knowledge search "<query>"` — match concept titles, descriptions, tags,
  and bodies across every enabled bundle.
- `axm knowledge open <bundle> <concept>` — print one concept by ID.

```bash
axm knowledge search "session"
axm knowledge open platform auth/session-management
```

## Configuration

Installed bundles are tracked in `.axm/settings.json` under the `knowledge` map
(name → entry) and locked in `.axm/axm-lock.yaml`. An entry is a source string,
or an object with `source` plus optional flags:

```jsonc
{
  "knowledge": {
    "platform": {
      "source": "@acme/knowledge/platform@^1.0.0",
      "enabled": false,
    },
  },
}
```

Use `axm knowledge disable <name>` to drop a bundle out of search and discovery
while keeping it installed, and `axm knowledge enable <name>` to restore it.
Prefer the CLI over hand-editing — it normalizes the shape and refreshes the
instruction discovery table.

## Publishing

`axm knowledge publish @owner/knowledge/<name>` validates the manifest and the
bundle, then releases a new version. Add `--preview` to dry-run the manifest
and publish checks without releasing.

Bump the manifest `version` first; the registry rejects a version that already
exists.

## Where to go next

- `axm knowledge --help` — full knowledge subcommand surface
- `axm help knowledge-schema` — raw `knowledge.json` JSON Schema
- `axm help settings` — workspace state and the `knowledge` map
- `axm help workspace-state` — bundle and discovery reconciliation
- `axm help authoring` — descriptions, keywords, and READMEs for the registry
