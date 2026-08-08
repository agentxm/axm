# Authoring metadata

Guidance for the registry-facing text you write when you publish an extension:
the manifest `description`, `keywords`, and the package `README.md`. Good
metadata is what makes an extension findable and trustworthy in search and
listings.

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
in registry listings, search results, and `axm view <handle> description`. It is
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

## README.md

A `README.md` at the extension root is published as part of the package and is
the long-form, human-facing companion to the one-line `description`. AXM ships
it in the package but **excludes it from agent artifacts** — it is never copied
into an agent's skill or command directory, so it never becomes model context.
Write it for a person deciding whether to install.

Cover, in order:

1. What the extension does and who it is for.
2. When to use it — and when not to.
3. How to install it (`axm install @owner/<type>s/<name>`).
4. A short usage example.

Keep agent-facing instructions in `SKILL.md` (or the content file), not the
README. The two do not overlap: the README sells the extension to a human; the
content file instructs the model.

## Where to go next

- `axm help skills` — writing the `SKILL.md` frontmatter `description` for model invocation
- `axm help knowledge` — writing bundle indexes and descriptions for progressive discovery
- `axm help package-extensions` — companion packages and Official status
- `axm view <handle>` — inspect the published metadata of any extension
