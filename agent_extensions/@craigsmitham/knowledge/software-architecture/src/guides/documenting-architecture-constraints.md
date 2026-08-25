---
type: Guide
title: Documenting architecture constraints
description: How to create one binding Architecture Constraint with explicit authority, affected scope, architectural consequences, and release or review conditions.
tags:
  [
    architecture-documentation,
    architecture-constraints,
    authority,
    limitations,
    consequences,
    authoring,
  ]
status: draft
sources:
  - resource: ../architecture-documentation/software-architecture-application-profile.md#architecture-constraint
    title: Software architecture docs application profile — Architecture Constraint
  - resource: ../architecture-documentation/just-enough-architecture-docs.md
    title: Just Enough Architecture Docs
generated: { by: codex/gpt-5.6, at: 2026-08-23T02:10:17Z }
---

# Documenting architecture constraints

## Goal

Create one `Architecture Constraint` under `constraints/` for an externally
imposed, binding limitation that materially restricts the acceptable
architecture.

## Before you begin

Confirm the binding authority and affected system scope. Do not relabel an
internal architecture decision, preference, assumption, current implementation
property, or unresolved requirement as a constraint.

## Steps

1. Name the limitation by its durable obligation rather than its current
   implementation response.
2. Create `constraints/<constraint>.md` using the exact `Architecture
Constraint` type and common fields from the [application profile](../architecture-documentation/software-architecture-application-profile.md#architecture-constraint).
3. If this is the first admitted constraint, create a navigational
   `constraints/index.md` and link the collection from the architecture root.
   Never create `constraints.md` or a Constraint Set concept.
4. Identify the contract, law, policy, platform boundary, external dependency,
   or other authority that makes the limitation binding.
5. Define the affected systems, data, behaviors, environments, or changes and
   state material exclusions.
6. Explain the architectural consequences without turning the constraint into
   a catalog of current implementation.
7. State who or what can release, alter, or reinterpret the constraint and the
   conditions that require review.
8. Link decisions, Product Quality Requirements, or architecture concepts that
   respond to the constraint while preserving their separate semantic owners.

## Final check

- The limitation is binding and externally imposed on the architecture.
- Authority, affected scope, consequences, and release or review conditions
  are explicit.
- The concept is not an internal decision, preference, assumption, or current
  implementation property.
- One named file owns one atomic constraint.
- `constraints/` contains admitted content and no `constraints.md` exists.

## Related

- [Documenting architecture decision records](documenting-architecture-decision-records.md)
- [Documenting architecture decision policies](documenting-architecture-decision-policies.md)
- [Documenting product quality requirements](documenting-product-quality-requirements.md)
- [Organizing an architecture docs corpus](organizing-an-architecture-docs-corpus.md)
