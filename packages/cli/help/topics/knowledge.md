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
  "description": "Platform authentication architecture, session lifecycle, and operational runbooks",
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

`src/index.md` is the required discovery root. It carries the bundle's
`okf_version` in YAML frontmatter and at least one level-one heading:

```markdown
---
okf_version: "0.2"
---

# Platform knowledge

Platform authentication architecture and operating policy. Use this bundle
when changing login, session, or token behavior.

## Authentication

- [Session management](auth/session-management.md) — How sessions are issued,
  refreshed, and revoked.
- [Token policy](auth/token-policy.md) — Token kinds, lifetimes, and storage
  boundaries.
```

`index.md` and `log.md` are reserved names. Nested `index.md` files are section
indexes and must not carry frontmatter; `log.md` records change history under
`## YYYY-MM-DD` headings, newest first.

## Progressive discovery

Knowledge is discovered in four layers. Each layer should contain only enough
information to route the reader to the next one:

| Layer                  | Authoring input                  | Reader decision                         |
| ---------------------- | -------------------------------- | --------------------------------------- |
| Workspace instructions | Manifest `description`           | Is this bundle relevant?                |
| Bundle landing page    | Root `src/index.md`              | Which section or concept should I open? |
| Search results         | Concept `description` and `tags` | Is this the right concept?              |
| Concept document       | Markdown body                    | What detailed knowledge applies?        |

The manifest `description` appears in Registry discovery and the managed
Knowledge Base table. Write one scannable sentence naming the bundle's domain
and distinctive scope. Avoid “A Knowledge extension that…”, repeating the
owner or name, keyword lists, and exhaustive inventories.

Treat every `index.md` as a routing map, not a container for detailed knowledge:

- Open with a short statement of scope, intended use, and important exclusions
  or relationships.
- Group links under meaningful headings and annotate each link with what makes
  that concept or section distinct.
- Keep substantive knowledge in concept documents.
- Introduce nested section indexes when the root becomes difficult to scan.
- Keep every concept reachable from the root index.

Within a bundle, use ordinary Markdown links relative to the document containing
the link. A same-directory link can use `session-management.md`; a concept in
`auth/` can link to `../domain/authentication.md`. AXM accepts valid relative
links and warns about missing targets or links that escape the bundle.

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
  warns when they are missing. Make the description distinguish this concept
  from its neighbors rather than repeat its title. Use tags for stable domain
  terms, aliases, and query vocabulary without mechanically repeating every
  title or description word.

OKF provenance fields are validated when present: `sources`, `generated`,
`verified`, `status`, `stale_after`, and `resource`. Actors follow the OKF
convention — `<producer>/<version>`, `human:<id>`, or `process:<id>`.

Concept `resource` values may be absolute URIs or paths contained in the
bundle. A `sources[].resource` additionally accepts a prose scope description.
Paths beginning with `/` resolve from the bundle root; other paths resolve from
the concept document that declares them. AXM rejects paths that escape the
bundle, and warns without failing when a contained target is missing. Query and
fragment suffixes do not affect containment or existence checks.

The active schemes `javascript:`, `vbscript:`, and `data:` are blocked
case-insensitively. Other syntactically absolute schemes are accepted; AXM does
not dereference resource URIs during validation.

## Authoring

Run `axm knowledge new <name>` to scaffold a bundle with its manifest and a
root index, then add concept files under `src/`.

Validate while you write:

```bash
axm knowledge lint --path ./.axm/extensions/@acme/knowledge/platform
```

Lint reports errors (missing root index, missing concept `type`, invalid
frontmatter, escaping resource paths, unsafe paths, broken internal links,
detected secrets) and warnings (missing resource targets, missing description
or tags, concepts unreachable from an index). Errors exit non-zero; warnings do
not.

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
The versioned region is `region=knowledge` with
`ext=@agentxm/knowledge/discovery`.

Discovery is enabled by default. Disable only the table with:

```jsonc
{
  "knowledgeConfig": {
    "instructions": false,
  },
}
```

This does not uninstall, distrust, or disable Knowledge, and concept discovery
remains available. Global instruction ownership remains under the top-level
`instructionFiles` setting; when that setting is absent or false, Knowledge
does not mutate instruction files.

`axm sync` restores missing canonical content from exact locked registry
versions or pinned git trees, treats local and workspace sources as
authoritative, and reconciles the table without advancing versions. Use
`axm sync --preview` to preview table changes. Unknown files are preserved.

## Discovery

- `axm knowledge list` — installed bundles with concept and diagnostic
  counts.
- `axm knowledge concepts resolve <input>` — resolve an exact compact or HTTPS
  reference; add `--fuzzy` to request bounded ID and title candidates.
- `axm knowledge concepts search "<query>"` — run the concise lexical grammar.
- `axm knowledge concepts query [expression]` — combine text, field, metadata,
  lifecycle, and preserved-frontmatter filters.
- `axm knowledge concepts get <reference>` — read one exact concept with source,
  projection, bundle, and corpus revision identity.
- `axm knowledge concepts related <reference>` — traverse authored links and
  derived backlinks to a maximum depth of three.
- `axm knowledge concepts status` — report the versioned capabilities contract
  and selected corpus fingerprint.

Search uses a locale-independent, Unicode-normalized lexical grammar:

- Bare terms use all-terms matching. Term order does not matter, and separate
  terms may match different fields of one concept.
- Whitespace and punctuation delimit ordinary terms. Repeated spaces, tabs,
  newlines, hyphens, underscores, and comparable punctuation are equivalent
  boundaries; surrounding whitespace is ignored.
- Camel-case and code-token boundaries split into terms. Terms match complete
  tokens only; AXM does not stem words or match a term as a word substring.
- A double-quoted phrase requires contiguous normalized tokens in one field,
  so `"source of truth"` matches authored `source-of-truth`.
- `literal:"<text>"` preserves the authored punctuation and whitespace. Literal
  matching remains case-insensitive: `literal:"source-of-truth"` does not match
  authored `source of truth`.
- A term, phrase, or literal never matches by spanning two searchable fields.
- Empty, whitespace-only, punctuation-only, empty-phrase, and empty-literal
  queries fail validation instead of enumerating the corpus.

`concepts get --json` returns the complete parsed frontmatter mapping, including
producer-defined fields, alongside resolved bundle version, bundle fingerprint,
content revision, and projection revision. Treat authored fields as untrusted
source data. `--raw` includes the exact source document in machine output, and
`--if-revision` fails with a typed conflict result when content changed.

Search and query results are concept-level rather than chunk-level. Evidence
passages include exact clause spans and source line ranges. Page cursors are
opaque, expire after 24 hours, and bind the selected corpus, canonical query,
ordering position, and issue time. Restart a query after a corpus-change or
expiry conflict.

`concepts query` accepts repeatable typed filters. `--metadata` and
`--property` use `=` (equals), `!=` (not equals), or `~=` (contains);
`--lifecycle` uses `=` or `!=`. Property names are RFC 6901 JSON Pointers into
preserved frontmatter. `--kind index` or `--kind log` deliberately includes
reserved documents, while `--status deprecated` deliberately includes
deprecated concepts. An unconstrained query enumerates ordinary,
non-deprecated concepts in stable bundle-and-concept order.

The versioned query contract advertises these searchable fields: `bundle`,
`conceptId`, `title`, `description`, `tag`, `type`, `body`, `resource`,
`status`, `staleAfter`, `generated`, `verified`, and `trust`. Its complete
operator set is `term`, `phrase`, `literal`, `equals`, `not-equals`, and
`contains`. `concepts status --json` is the machine-readable source for the
same contract and its current bounds.

```bash
axm knowledge concepts search "session"
axm knowledge concepts search '"source of truth"'
axm knowledge concepts query session --tag auth --status stable --explain
axm knowledge concepts query --metadata 'tag~=auth' --property '/audience=agents'
axm knowledge concepts get '@acme/knowledge/platform#auth/session-management'
axm knowledge concepts related '@acme/knowledge/platform#auth/session-management' --depth 2
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

## Self-containment and packs

Keep Knowledge bundles self-contained. If a bundle requires another extension,
follow `axm help packs` for the only supported direct-sibling pack composition.
`recommendedPacks` alone does not install the pack or its members.

## Where to go next

- `axm knowledge --help` — full knowledge subcommand surface
- `axm help knowledge-schema` — raw `knowledge.json` JSON Schema
- `axm help settings` — workspace state and the `knowledge` map
- `axm help workspace-state` — bundle and discovery reconciliation
- `axm help authoring` — descriptions, keywords, and READMEs for the registry
- `axm help packs` — optional recommendations and required sibling composition
