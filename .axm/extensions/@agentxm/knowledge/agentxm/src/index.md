---
okf_version: "0.2"
---

# AgentXM platform knowledge

Curated public knowledge about the AgentXM platform and the AXM extension
model. Concepts are self-contained; start anywhere, or from the domain model.

## Domain

- [The AgentXM extension model](domain/extension-model.md) — What an AgentXM
  extension is, how the registry, workspace, and ownership fit together, and
  the four kinds of workspace state AXM reconciles.
- [Extension types](domain/extension-types.md) — The seven AgentXM extension
  types and the governing standard behind each.
- [Identifier grammar](domain/identifier-grammar.md) — The normative
  AgentXM identifier grammar: slugs, handles, type IDs, FQNs, library
  references, identity tuples, version strings, and reserved filenames.
- [Handles and ownership](domain/handles-and-ownership.md) — Handles as
  publisher identity: recyclable names with cooldowns, permanent version
  tombstones, freezes, and publisher-epoch safety.
- [Extension pack semantics](domain/pack-semantics.md) — Packs reference
  (never copy) leaf extensions, stay depth-1 by construction, resolve to
  pinned dependency maps, and uninstall orphan-aware.
- [Visibility and discovery](domain/visibility-and-discovery.md) — The
  two-value public/private perimeter, hidden existence, defaults,
  mutability, and how yank and deprecation differ.
- [AXM and AgentXM naming](domain/naming.md) — When to write the all-caps
  product name, when to use the lowercase code identifier, and how the CLI
  relates to the platform.

## Architecture

- [Public platform surfaces](architecture/platform-surfaces.md) — The
  publicly reachable AgentXM surfaces and what each serves.

## Workflows

- [The extension lifecycle](workflows/extension-lifecycle.md) — Scaffold,
  author, lint, publish; then discover, install, reconcile, update, retire.

## References

- [Public resources](references/public-resources.md) — Canonical public
  sites, installers, schemas, CLI help topics, repositories, standards,
  official accounts, and contact.
