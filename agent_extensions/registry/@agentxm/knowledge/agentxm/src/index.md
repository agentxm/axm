---
okf_version: "0.2"
---

# AgentXM platform knowledge

Curated public knowledge about the AgentXM platform and the AXM extension
product model. Concepts are self-contained; start anywhere, or from the domain
model.

## Capabilities

- [AgentXM capabilities](capabilities.md) — System-wide capabilities for AXM
  workspace management and AgentXM discovery, sharing, and governance.

## Domain

- [The AgentXM product model](domain/extension-model.md) — The shared AgentXM
  product model: accounts, agents, extensions, versions, types, ownership, the
  registry, AXM, workspaces, native locations, readers, consumers, packs, and
  libraries.
- [Extension sources and resolution](domain/sources.md) — The vocabulary that
  separates where extension content comes from, how AXM locates it, what exact
  content a workspace accepted, and how it is named locally.
- [Extension types](domain/extension-types.md) — The seven AgentXM extension
  types and the governing standard behind each.
- [Identifier grammar](domain/identifier-grammar.md) — The normative AgentXM
  identifier grammar: slugs, handles, type IDs, FQNs, library references,
  identity tuples, version strings, and reserved filenames.
- [Handles and ownership](domain/handles-and-ownership.md) — How AgentXM handles
  work as the identity extensions are published under — one handle per account,
  recyclable names with cooldowns, permanent version tombstones, administrative
  freezes, extension holds, name-reuse holds, and publisher-epoch safety.
- [Extension pack semantics](domain/pack-semantics.md) — Packs compose
  references to independently owned and versioned leaf extensions without
  copying or nesting them.
- [Visibility and discovery](domain/visibility-and-discovery.md) — How extension
  and Library visibility works on the AgentXM registry — the public/private
  perimeter, hidden existence, and how visibility differs from archive, hold,
  deletion, yank, deprecation, and Library curation archival.
- [AXM and AgentXM naming](domain/naming.md) — When to write the all-caps
  product name, when to use the lowercase code identifier, and how the CLI
  relates to the platform.

## Architecture

- [Public platform surfaces](architecture/platform-surfaces.md) — The publicly
  reachable AgentXM surfaces and what each serves.

## Ecosystem foundations

- [Agent Skills](ecosystem/agent-skills.md) — Portable, task-specific agent
  instructions and supporting resources.
- [AGENTS.md](ecosystem/agents-md.md) — Repository-scoped instructions for
  coding agents.
- [Model Context Protocol](ecosystem/model-context-protocol.md) — Connections
  between AI applications and external tools, data, prompts, and workflows.
- [Agent Plugins](ecosystem/agent-plugins.md) — Portable plugins that combine
  standard agent components while leaving client policy to implementers.
- [Open Knowledge Format](ecosystem/open-knowledge-format.md) — Portable, human-
  and agent-readable knowledge represented as Markdown concepts.
- [Package URL and VERS](ecosystem/package-url-and-vers.md) — Cross-ecosystem
  software-package identity and compatible version ranges.

## Workflows

- [The extension lifecycle](workflows/extension-lifecycle.md) — The extension
  lifecycle from an author's and consumer's point of view — scaffold, author,
  lint, publish, archive or restore, then discover, install, reconcile, update,
  switch sources, and retire.

## References

- [Public resources](references/public-resources.md) — Canonical public sites,
  installers, schemas, CLI help topics, repositories, standards, official
  accounts, and contact.
