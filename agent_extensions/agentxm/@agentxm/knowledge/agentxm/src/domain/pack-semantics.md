---
type: Domain Concept
description: "The shared semantics of extension packs: versioned extensions that compose references to leaf extensions without copying or nesting them."
tags: [packs, extensions, dependencies, composition]
status: stable
generated:
  by: openai/codex
  at: 2026-08-16T01:34:22Z
sources:
  - id: pack-schema
    resource: https://axm.sh/schemas/pack.schema.json
    title: Pack manifest JSON Schema
---

# Extension pack semantics

A **pack** is an extension whose content is a collection of references to other
extensions.[^pack-schema] It gives the collection one name and lifecycle without
merging the identities or content of its members.

## Composition rules

- A pack contains zero or more extension references.
- Each reference identifies an extension and a permitted version or version
  range.
- A reference does not copy the member extension or transfer its ownership.
- Pack members remain independently versioned extensions with their own types,
  owners, visibility, and lifecycle.
- A pack may reference leaf extension types only. A pack cannot reference
  another pack, so pack composition has one level and cannot form cycles.

Installing or resolving a pack therefore means resolving its member references;
it does not create a combined extension identity. Exact resolution records,
local retention, and uninstall behavior are AXM workspace concerns rather than
part of the shared pack definition.

Member lifecycle remains live and independent of the pack. A member's later
deprecation does not invalidate the pack, change its published content, or alter
version resolution. Pack inspection and installation can surface that member's
current warning and actionable replacement guidance when the reader is allowed
to see it; unavailable guidance does not disclose a private or deleted target.

Related: [The AgentXM product model](extension-model.md) and
[Extension types](extension-types.md). The identity-level lifecycle and its
visibility boundary are defined by
[Visibility and discovery](visibility-and-discovery.md).

[^pack-schema]: Pack manifest JSON Schema.
