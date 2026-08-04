# Knowledge

Knowledge bundles live canonically in
`./.axm/extensions/<@owner>/knowledge/<name>` and expose their `src/` roots
through an agent-facing projection.

A knowledge bundle is portable reference material — architecture notes, domain
vocabulary, runbooks — packaged as a tree of Markdown concept documents. Unlike
rules, a bundle is never injected into an agent's instruction files. It is
installed, indexed, and read on demand, so an agent (or a person) can search it
without spending context on material the task does not need.

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

## Agent-facing projection

Enabled bundles are projected by manifest identity under
`.agents/knowledge/@owner/name` by default. AXM prefers relative directory
symlinks and falls back to managed copies when symlinks are unavailable. The
aggregate `.agents/knowledge/index.md` lists enabled bundles deterministically,
and a managed instruction-file region directs agents to that index while
identifying Knowledge content as untrusted reference material.

`.agents/knowledge` is an AXM convention rather than a native agent discovery
directory. Set `knowledgeConfig.directory` in `.axm/settings.json` to choose
another path relative to the active project or user scope:

```jsonc
{
  "knowledgeConfig": {
    "directory": "docs/agent-knowledge",
  },
}
```

The path must remain inside the active scope and must not overlap `.axm`.
Changing it and running `axm sync` builds and verifies the new projection before
removing AXM-managed artifacts from the old location. Unknown files are
preserved.

`axm sync` restores missing canonical content from exact locked registry
versions or pinned git trees, treats local and workspace sources as
authoritative, and reconciles the projection without advancing versions. Use
`axm sync --dry-run` to preview creates, updates, removals, and the selected
symlink or copy mechanism.

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
concept index.

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
- `axm help workspace-state` — bundle, index, and discovery reconciliation
- `axm help authoring` — descriptions, keywords, and READMEs for the registry
