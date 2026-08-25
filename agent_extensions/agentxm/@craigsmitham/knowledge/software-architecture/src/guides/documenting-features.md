---
type: Guide
title: Documenting features
description: How to create one optional Feature concept whose recognizable behavior has durable identity beyond one use case, surface, implementation, or delivery item.
tags: [architecture-documentation, features, behavior, actors, evidence, authoring]
status: draft
sources:
  - resource: ../foundations/capabilities.md
    title: Capabilities in software architecture
  - resource: ../foundations/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: ../architecture-documentation/software-architecture-application-profile.md#feature
    title: Software architecture docs application profile — Feature
generated: { by: codex/gpt-5.6, at: 2026-08-25T19:19:59Z }
---

# Documenting features

## Goal

Create one optional `Feature` concept under `features/` for independently
recognizable behavior that matters across one or more use cases, surfaces, or
realizations.

## Before you begin

Document a feature only when its durable behavior or boundary matters beyond
the work that delivered it and beyond merely paraphrasing one use case. If the
candidate has no independent cross-use, cross-surface, policy, or realization
meaning, omit the Feature and link directly from the Use Case to its other
architecture views. Keep prioritization, release state, estimates, and
implementation tasks in delivery authorities.

## Steps

1. Name the recognizable behavior in actor or domain language rather than by
   project code name or implementation component.
2. Create its canonical file using the `Feature` type and common fields from
   the [application profile](../architecture-documentation/software-architecture-application-profile.md#feature).
3. State the actors, conditions, recognizable behavior, and intended outcome.
   Explain why this behavior has durable identity independent of one use case.
4. Explain material exclusions and failure context shared across use cases,
   surfaces, or implementations. Link accepted behavior, invariant, failure,
   or recovery Requirements rather than restating their binding outcomes.
5. Link the use cases it enables, capabilities it contributes to, surfaces
   through which it is available, domain authorities governing it, and C4
   elements realizing it.
6. Link tests or executable examples that own precise supported scenarios,
   then update `features/index.md`.

## Final check

- The feature is recognizable to an actor, not merely an internal mechanism.
- It has independent meaning rather than restating one actor goal and scenario.
- Its meaning survives completion of the delivery work item.
- It remains distinct from provider capability and interaction surface.
- Accepted behavior and failure obligations have one linked Requirement
  authority.
- Exact behavior inventories remain with executable evidence.

## Related

- [Capabilities in software architecture](../foundations/capabilities.md)
- [Goal-oriented behavior and use cases](../foundations/goal-oriented-behavior.md)
- [Documenting use cases](documenting-use-cases.md)
- [Documenting capabilities](documenting-capabilities.md)
- [Documenting surfaces](documenting-surfaces.md)
