---
type: Guide
title: Mapping to requirements hosts
description: Maps portable requirement semantics into native tool fields while preserving authority, identity, relationships, and read-back accuracy. Use when writing or reading requirements in a tracker, specification repository, or requirements-management platform.
tags: [requirements-management, host, native-fields, mapping, read-back, pe-solution]
sources:
  - id: authority-model
    resource: ../foundations/one-authority-many-witnesses.md
    title: One authority, many witnesses
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Mapping to requirements hosts

Requirements may live in Markdown, specifications, model repositories, product
tools, issue trackers, application-lifecycle systems, or specialist
requirements-management platforms. Select the authoritative host deliberately
under the one-authority model.[^authority-model]

This guide covers requirement hosts only. The same discipline applied to work
items, where the fields, labels, and relationship types belong to a tracker
rather than to a requirements platform, is [Mapping work items to native
hosts](../../../delivery/work-items/common/mapping-to-work-item-hosts.md). Both
guides derive from [One authority, many
witnesses](../foundations/one-authority-many-witnesses.md), which owns the rule
they share: a host record is a witness unless it has been declared the
authority. Read that principle once, then the guide for the artifact in hand.

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
