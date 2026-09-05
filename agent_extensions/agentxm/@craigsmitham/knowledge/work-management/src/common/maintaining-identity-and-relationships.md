---
type: Guide
title: Maintaining work-item identity and relationships
description: Use when creating, relating, duplicating, merging, splitting, superseding, or reopening work items without losing independently meaningful history.
tags: [work-item, identity, relationships, duplicate, merge, split, supersession, reopening, regression]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Maintaining work-item identity and relationships

This guide adapts the identity and relationship portions of the earlier common
lifecycle guidance.

## Reuse or create an identity

Reuse an item when new evidence concerns the same independently managed case
and the record can retain every material occurrence. Create a separate item
when the new concern has an independent occurrence, discrepancy, bounded
outcome, impact or response path, decision or delivery authority, rollback or
verification condition, or work-item role.

A Defect Report and the Change that remediates it therefore keep separate
identities. Do not retitle one into the other as understanding advances.

## State relationship meaning

Use an exact native relationship when available. Otherwise record linked stable
identities and explicit direction in the body. Useful meanings include:

- another occurrence of the same case;
- duplicate of a named canonical item;
- blocks or depends on;
- is source evidence for;
- remediates or follows up;
- related incident, Defect Report, Change, or regression; and
- supersedes or is superseded by.

Do not force every relationship into parent-child form. Maintain one canonical
assertion and treat reciprocal links as projections.

## Preserve history through structure changes

For a duplicate or merge, choose the canonical identity under local authority,
retain each source occurrence and material evidence, record the decision and
rationale, and leave a durable route from every non-canonical item. For a split,
create independently manageable identities and allocate sources and scope
without loss. Supersession means a successor replaces named meaning or work; it
does not mean deletion, invalidity, or verified delivery.

For a regression, preserve the new occurrence first, then follow local policy
to reopen the earlier item or create a linked record. Never erase the earlier
resolution or verification result; it remains evidence for its original
revision and conditions.
