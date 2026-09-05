---
type: Guide
title: Mapping to requirements hosts
description: Maps portable requirement semantics into native tool fields while preserving authority, identity, relationships, and read-back accuracy.
tags: [requirements-management, host, native-fields, mapping, read-back]
sources:
  - id: authority-model
    resource: ../foundations/one-authority-many-witnesses.md
    title: One authority many witnesses
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# Mapping to requirements hosts

Requirements may live in Markdown, specifications, model repositories, product
tools, issue trackers, application-lifecycle systems, or specialist
requirements-management platforms. Select the authoritative host deliberately
under the one-authority model.[^authority-model]

Prefer native structured fields and typed links when they preserve the
[content contract](../authoring/requirement-content-contract.md) exactly. Use
body sections only for semantics the host cannot represent. Maintain a mapping
for local states, relationship types, and classifications; do not assume labels
with similar names have identical meanings.

Before a write, resolve the exact target, permissions, project instructions,
and current revision. After a write, read the record back and confirm identity,
field values, formatting, links, and revision. Report partial or lossy mappings.

Exported copies and generated views are witnesses unless explicitly designated
as authoritative. Preserve stable links and synchronization ownership.

[^authority-model]: The cited authority model defines the distinction between
    the authoritative requirement and its host-specific witnesses.
