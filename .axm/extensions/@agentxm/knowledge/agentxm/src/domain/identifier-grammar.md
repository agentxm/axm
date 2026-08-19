---
type: Domain Concept
description: The normative AgentXM identifier grammar — slugs, handles, extension type IDs, FQNs, library references, identity tuples, version strings, and reserved filenames.
tags: [identifiers, fqn, handle, slug, grammar, naming]
status: stable
generated:
  by: openai/codex
  at: 2026-08-13T18:34:00Z
sources:
  - id: axm-readme
    resource: https://github.com/agentxm/axm/blob/main/README.md
    title: AXM repository README (publishing and install examples)
---

# Identifier grammar

This concept is normative for AgentXM's user-facing identifier grammar. The
grammar is observable across the registry, the AXM CLI, and published
manifests.

| Identifier                   | Canonical form                  | Notes                                                                                                                                                                                      |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slug (plain)                 | `<slug>`                        | Lowercase letters, digits, and `_`, with `-` allowed between the first and last character (pattern `^[a-z0-9_]$` or `^[a-z0-9_][a-z0-9_-]*[a-z0-9_]$`); no dots. No verification required. |
| Slug (domain)                | `<domain>`                      | Valid domain-like slug with dots; requires DNS verification.                                                                                                                               |
| Handle                       | `@<slug>`                       | Canonical registry identity string used in APIs, routes, settings, and FQNs.                                                                                                               |
| Canonical extension type ID  | kebab-case                      | `skill`, `mcp-server`, `subagent`, `rule`, `hook`, `knowledge`, `pack`.                                                                                                                    |
| Route extension type segment | plural kebab-case               | `skills`, `mcps`, `subagents`, `rules`, `hooks`, `knowledge`, `packs`. `knowledge` is not pluralized.                                                                                      |
| Core product feature label   | Title Case                      | `Skills`, `MCP Servers`, `Subagents`, `Rules`, `Hooks`, `Knowledge`, `Packs`.                                                                                                              |
| Core product feature ID      | plural kebab-case               | `skills`, `mcps`, `subagents`, `rules`, `hooks`, `knowledge`, `packs`.                                                                                                                     |
| FQN (route/input form)       | `@<slug>/<plural-type>/<name>`  | Example: `@acme/skills/code-review`.                                                                                                                                                       |
| Library reference            | `@<slug>/libraries/<name>`      | Registry Library identity for routes and APIs; not an extension FQN or install target. Library names use slug grammar; `libraries` and `new` are reserved.                                 |
| Extension identity tuple     | `(handle, type, name)`          | Type uses canonical singular ID. Handle is always full `@<slug>` form.                                                                                                                     |
| Extension version tuple      | `(handle, type, name, version)` | Immutable after publish. Handle is always full `@<slug>` form.                                                                                                                             |
| Extension version string     | SemVer 2.0.0                    | `major.minor.patch` with optional pre-release/build metadata; no `v` prefix.                                                                                                               |
| Settings source name         | lowercase alnum + `.` + `-`     | Matches `^[a-z0-9][a-z0-9.-]*$`.                                                                                                                                                           |
| Settings filename            | `settings.json`                 | AXM workspace configuration file.                                                                                                                                                          |
| Lockfile filename            | `axm-lock.yaml`                 | AXM workspace exact-resolution record.                                                                                                                                                     |
| Skill manifest filename      | `skill.json`                    | Native schema-validated manifest for a skill.                                                                                                                                              |
| Skill document filename      | `SKILL.md`                      | Upstream markdown skill document; YAML frontmatter followed by markdown body.                                                                                                              |
| Hook manifest filename       | `hook.json`                     | Native schema-validated manifest for managed hook content.                                                                                                                                 |

Handles are always serialized in full `@<slug>` form — parsers reject bare
slugs where a handle is expected. The seven-type vocabulary is the complete
type grammar; whether a given type is available on a given surface at a given
time is release status, not grammar, and is not recorded here.

Related: [Handles and ownership](handles-and-ownership.md) for handle
lifecycle semantics, [Extension types](extension-types.md) for what each type
does.[^axm-readme]

[^axm-readme]:
    FQN and install spellings match the public AXM repository
    README examples (`@acme/skills/code-review`).
