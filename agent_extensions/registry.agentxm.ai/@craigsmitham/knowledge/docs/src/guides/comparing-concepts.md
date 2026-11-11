---
type: Guide
title: Comparing concepts
description: Use when readers repeatedly confuse related concepts; clarify their differences and keep shared comparisons in one maintained place.
tags:
- docs
- concepts
- boundaries
- comparison
- disambiguation
- authority
- discovery
status: draft
sources:
- id: documentation-craft
  resource: ../explainers/documentation-craft.md
  title: Documentation craft
- id: documentation-audits
  resource: ../explainers/documentation-audits.md
  title: Documentation audits
- id: documentation-organization
  resource: ../explainers/documentation-organization-and-discovery.md
  title: Documentation organization and discovery
generated:
  by: codex/gpt-6
  at: '2026-11-11T16:45:58Z'
---

# Comparing concepts

Use this guide when related concepts are repeatedly confused or several pages
repeat the same comparison. A local sentence is enough for an isolated ambiguity;
a separate comparison earns its place only when readers or maintainers need it.

## Steps

1. Identify the smallest set of concepts involved and the decisions the confusion affects.
2. Keep each concept's positive definition in its own authoritative document.
3. Compare the relevant differences: purpose, scope, authority, overlap, and conditions for choosing each. Use only axes that resolve the confusion.
4. Put a substantive recurring comparison in one document. Keep local reminders short and link to it; indexes should route readers rather than own the analysis.
5. Use a table for quick lookup and prose or contrasting examples for relationships a table cannot express. Do not force overlap into a false hierarchy.
6. Review the definitions and comparison together when either changes.

## Example shape

| Concept | Question answered | Owns | Does not own |
| --- | --- | --- | --- |
| First concept | What does it help decide? | Its responsibility | A neighboring responsibility |
| Second concept | What different question does it answer? | Its responsibility | The first concept's responsibility |

The comparison owns the relationship, not every definition it mentions. Use
reference-style presentation for lookup or explanation when reasoning is the
main need. Do not introduce a metadata type just to mark a comparison.

## Check

A reader can distinguish the concepts and explain when the difference matters.
Each definition has one owner; the full comparison is not repeated across the
collection. Remove or fold back a comparison that adds navigation without value.
This is editorial guidance, not a claim of independently measured effectiveness.

## Related

- [Documentation organization and discovery](../explainers/documentation-organization-and-discovery.md)
- [Organizing and naming documentation](organizing-and-naming-documentation.md)
