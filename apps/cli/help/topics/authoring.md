# Authoring extensions

Use this topic when writing agent guidance or preparing the manifest and README
that readers will see in Registry listings. For choosing which files ship, inspecting the candidate archive, and configuring
`publish.include` and `publish.exclude`, see `axm help publish`.

Keep every non-pack extension self-contained. If it requires another extension,
name that sibling by its extension identity and let the agent resolve it through
its own discovery — never by file path. See `axm help packs` for pack
composition. `recommendedPacks` is metadata only; it does not install the pack
or its members.

## Basic authoring

Write a skill or instruction around the result the user needs. Explain any
step whose order or method affects that result. Give commands as examples
where the agent can choose an equally sound approach. With the optional
`@agentxm/packs/agent-extension-engineering` pack installed, read the principle
with `axm knowledge concepts get '@agentxm/knowledge/agent-extension-engineering#principles/preserve-agent-judgment'`.

For a new package, the type's `new` command scaffolds the authored source.
For an existing package, `axm show <name>` identifies the source and editing
authority. Edit the canonical workspace-authored source. For skill conventions,
see `axm help skills`. For exact manifest fields, see `axm help skill-schema`.

Use `axm lint --json` to check structure, `axm sync --preview --json` to see
proposed projection changes, or a representative request in the intended host
to see how the agent applies the guidance. Choose the check that answers the
question at hand.

For a worked example of choosing release files, see
`@agentxm/knowledge/agent-extension-engineering#guides/lifecycle` in the optional engineering pack.

The writing examples below are recommendations unless a schema or an explicit
AXM convention says otherwise.

## Creating from existing content

Use `fork` and the type-specific native import commands for different source
states:

- `axm fork <source> <extension>` starts a new workspace-authored package from
  an existing managed AXM package. Registry, exact `workspace`, local, and Git
  sources are supported. The source and target types must match; packs are
  copied shallowly, so their dependency map remains unchanged.
- `axm skills import <source> <extension>` and `axm subagents import <source>
<extension>` convert losslessly supported native content into managed Skill
  and Subagent packages from local or Git sources. Rules, Knowledge bundles,
  and Packs have no native package-conversion command.
- `axm hooks import <source> <extension>` packages a supported native hook
  registration and starts it inactive. See `axm help hooks` for its source
  and configuration selectors.
- `axm mcps adopt` takes unmanaged native MCP servers into inline management
  in the selected project or user scope. Repeat `--name` to select a subset.
- `axm mcps import <name> <extension>` converts one named native MCP server
  into a project-workspace package when it has a lossless package form. It
  starts disabled unless `--enable` is supplied.

The fork and native-import commands above create target version `0.1.0` and start a fresh target disabled
unless `--enable` is supplied. Disabled `fork`, `skills import`, and `subagents
import` operations leave their source projections untouched. MCP package import is the
explicit adoption case: after the managed package validates, it replaces the
selected native config entry and leaves the managed target disabled unless
`--enable` is supplied. Use
`--preview` to inspect canonical and configuration changes without mutating the
workspace.

## Description layers

The manifest `description` is common Registry metadata. Some extension types
also define content-level descriptions for a different discovery job. Do not
copy one into another without considering its reader.

| Field                                | Reader                              | Purpose                                       |
| ------------------------------------ | ----------------------------------- | --------------------------------------------- |
| Manifest `description`               | A human browsing the Registry       | One-line summary in search and listings       |
| `SKILL.md` frontmatter `description` | The model deciding what to load     | Trigger text matched against the current task |
| Knowledge concept `description`      | A human or model searching a bundle | Distinguish one concept in search results     |

This topic covers the manifest field. For skill invocation triggers, see `axm
help skills`. For Knowledge bundle and concept discovery, see `axm help
knowledge`.

## Manifest `description`

The `description` field in the extension manifest is the one-line summary shown
in registry listings, search results, and `axm view <extension> description`. It is
optional, but an extension without one is far harder to find and evaluate.

Write it for a person scanning a list:

- **Lead with the capability.** Say what it does, not that it exists. Drop
  "This skill…" / "An extension that…" boilerplate.
- **One line.** No trailing period is needed; keep it scannable in a table.
- **Concrete over generic.** Name the domain, language, or tool.

```json
{
  "description": "Reviews TypeScript diffs for Effect idioms and common bugs."
}
```

Weaker: `"A helpful code review skill."` — no domain, no differentiation.

For Knowledge bundles, the manifest description also appears in the managed
workspace instruction table so an agent can decide whether to open the bundle's
root index. `axm help knowledge` owns that progressive-discovery guidance.

## Keywords, homepage, repository

- **`keywords`** — an array of lowercase terms people search for. Cover the
  domain, language, and task: `["lint", "typescript", "review"]`. These
  supplement the `description`; do not repeat it.
- **`homepage`** — a URL for docs or a landing page.
- **`repository`** — source location, including `directory` for monorepo
  publishers.

Run `axm help skill-schema` (or the matching `<type>-schema`) for the full field
list.

## Custom manifest metadata

Every extension manifest can declare an optional `metadata` object for
consumer-specific structured data:

```json
{
  "metadata": {
    "com.example/tool": {
      "enabled": true,
      "labels": ["review", "typescript"]
    }
  }
}
```

AXM treats this object as opaque, untrusted JSON. Use a namespace you control to
avoid collisions. Do not put secrets in metadata: metadata for a public
extension is public.

The compact UTF-8 JSON representation may contain at most 65,536 bytes and have
container depth at most 16. The root object is depth 1; each nested object or
array adds one. Other unrecognized top-level manifest fields remain invalid.

AXM includes metadata in the published extension archive. Registry consumers
can read it from the exact-version response; list and search results omit it.

## README.md

Write the package-root `README.md` for someone deciding whether to install.
Describe the task, give the install command, and show one example.

AXM ships the README when archive selection includes it. Agents can read it
from the package. Keep runtime instructions in the extension's content file,
such as `src/SKILL.md`, and version history in `CHANGELOG.md`.

## CHANGELOG.md

An optional `CHANGELOG.md` at the extension root records what changed between
published versions — one entry per version, newest first, naming the behavior,
requirement, or authority changes a consumer must act on. It ships in the
archive when selected for publication. Sitting outside `src/` keeps it out of
the skill projection, but agents may still read it. AXM assigns it no special behavior.

## Where to go next

- `axm help skills` — writing the `SKILL.md` frontmatter `description` for model invocation
- `axm help knowledge` — writing bundle indexes and descriptions for progressive discovery
- `axm help package-extensions` — companion packages and Official status
- `axm view <extension>` — inspect the published metadata of any extension
