---
type: Guide
title: Documenting C4 software systems
description: How to create one C4 Software System concept with a clear value, responsibility, boundary, and interaction context.
tags: [architecture-documentation, c4-model, software-systems, boundaries, authoring]
status: draft
sources:
  - resource: ../foundations/c4-model.md
    title: C4 model
  - resource: ../architecture-documentation/software-architecture-application-profile.md#c4-software-system
    title: Software architecture docs application profile — C4 Software System
generated: { by: codex/gpt-5.6, at: 2026-08-25T19:19:59Z }
---

# Documenting C4 software systems

## Goal

Create one `C4 Software System` concept under `structure/systems/` for the
highest-level software boundary being described.

## Before you begin

Confirm that the subject is a software system whose interactions matter to the
documented System. Do not equate it automatically with an offering,
capability, bounded context, repository, or organizational unit.

## Steps

1. Name the software system consistently with the documented system scope and
   existing C4 views.
2. Create its canonical file using the `C4 Software System` type and common
   fields from the [application profile](../architecture-documentation/software-architecture-application-profile.md#c4-software-system).
3. State the value it delivers, its software boundary, and one concise active
   responsibility naming the outcome, policy, state, or authority it owns.
   Add material non-responsibilities instead of a list of current functions.
4. Declare whether it is the primary software system or an external system relative
   to the documented scope.
5. Identify people and software systems that interact directly with it and
   label the meaning of consequential interactions.
6. For the primary software system, link the required root System, System
   Lifecycle, System Ownership, Architecture Decision Policy, and System Assurance concepts.
   Do not repeat their content here. For an external system, link a stable
   external authority only when its context is consequential and available.
7. Link offerings, capabilities, domain concepts, accepted Requirements,
   current implementation evidence, and selected views without making them C4
   children. An accepted invariant or guarantee is a Requirement of an
   eligible subject, not part of the responsibility sentence. Update the
   systems index.

## Final check

- The concept is a software boundary with a clear responsibility.
- Its material non-responsibilities keep adjacent ownership outside the
  boundary.
- Its primary or external role is explicit.
- Interactors and relationship meanings are understandable.
- The required root system context is discoverable without duplication.

## Related

- [C4 model](../foundations/c4-model.md)
- [Documenting C4 views](documenting-c4-views.md)
- [Reviewing responsibilities with scenarios](reviewing-responsibilities-with-scenarios.md)
