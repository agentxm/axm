---
type: Domain Concept
description: The normative AgentXM identifier grammar — slugs, handles, extension type IDs, FQNs, library references, identity tuples, version strings, and reserved filenames.
tags: [identifiers, fqn, handle, slug, grammar, naming]
status: stable
generated:
  by: claude/fable-5
  at: 2026-08-06T13:04:04Z
sources:
  - id: axm-readme
    resource: https://github.com/agentxm/axm/blob/main/README.md
    title: AXM repository README (publishing and install examples)
---

# Identifier grammar

This concept is normative for AgentXM's user-facing identifier grammar. The
grammar is observable across the registry, the AXM CLI, and published
manifests.

| Identifier | Canonical form | Notes |
| --- | --- | --- |
| Slug (plain) | `<slug>` | Lowercase letters, digits, and `_`, with `-` allowed between the first and last character (pattern `^[a-z0-9_]$` or `^[a-z0-9_][a-z0-9_-]*[a-z0-9_]$`); no dots. No verification required. |
| Slug (domain) | `<domain>` | Valid domain-like slug with dots; requires DNS verification. |
| Handle | `@<slug>` | Canonical registry identity string used in APIs, routes, settings, and FQNs. |
| Canonical extension type ID | kebab-case | `skill`, `command`, `mcp-server`, `subagent`, `files`, `rule`, `hook`, `knowledge`, `pack`. |
| Route extension type segment | plural kebab-case | `skills`, `commands`, `mcps`, `subagents`, `files`, `rules`, `hooks`, `knowledge`, `packs`. `knowledge` is not pluralized. |
| Core product feature label | Title Case | `Skills`, `Commands`, `MCP Servers`, `Subagents`, `Context Files`, `Rules`, `Hooks`, `Knowledge`, `Packs`. |
| Core product feature ID | plural kebab-case | `skills`, `commands`, `mcps`, `subagents`, `files`, `rules`, `hooks`, `knowledge`, `packs`. |
| FQN (route/input form) | `@<slug>/<plural-type>/<name>` | Example: `@acme/skills/code-review`. |
| Library reference | `@<slug>/libraries/<name>` | Registry Library identity for routes and APIs; not an extension FQN or install target. Library names use slug grammar; `libraries` and `new` are reserved. |
| Extension identity tuple | `(handle, type, name)` | Type uses canonical singular ID. Handle is always full `@<slug>` form. |
| Extension version tuple | `(handle, type, name, version)` | Immutable after publish. Handle is always full `@<slug>` form. |
| Extension version string | SemVer 2.0.0 | `major.minor.patch` with optional pre-release/build metadata; no `v` prefix. |
| Settings source name | lowercase alnum + `.` + `-` | Matches `^[a-z0-9][a-z0-9.-]*$`. |
| Settings filename | `settings.json` | Workspace desired-state document. |
| Lockfile filename | `axm-lock.yaml` | Workspace resolved-state document. |
| Skill manifest filename | `skill.json` | Native schema-validated manifest for a skill. |
| Skill document filename | `SKILL.md` | Upstream markdown skill document; YAML frontmatter followed by markdown body. |
| Context Files manifest filename | `files.json` | Native schema-validated manifest for a Context Files package. |
| Hook manifest filename | `hook.json` | Native schema-validated manifest for a managed hook package. |

Handles are always serialized in full `@<slug>` form — parsers reject bare
slugs where a handle is expected. The nine-type vocabulary is the complete
type grammar; whether a given type is available on a given surface at a given
time is release status, not grammar, and is not recorded here.

Related: [Handles and ownership](handles-and-ownership.md) for handle
lifecycle semantics, [Extension types](extension-types.md) for what each type
does.[^axm-readme]

[^axm-readme]: FQN and install spellings match the public AXM repository
    README examples (`@acme/skills/code-review`).
