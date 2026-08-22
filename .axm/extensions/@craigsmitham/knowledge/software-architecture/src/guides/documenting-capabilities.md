---
type: Guide
title: Documenting capabilities
description: How to create one Capability concept with a declared bearer, level, outcome-oriented ability, and useful boundary.
tags: [architecture-documentation, capabilities, abilities, outcomes, authoring]
status: draft
sources:
  - resource: ../foundations/capabilities.md
    title: Capabilities in software architecture
  - resource: ../foundations/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: ../architecture-documentation/software-architecture-application-profile.md#capability
    title: Software architecture docs application profile — Capability
generated: { by: codex/gpt-5.6, at: 2026-08-21T22:12:04Z }
---

# Documenting capabilities

## Goal

Create one `Capability` concept under `capabilities/` that states an
outcome-oriented ability of an identified organization, system, or subsystem.

## Before you begin

Confirm the bearer and level. Do not create a capability merely by renaming a
feature, application, process, team, goal, or planned work item.

## Steps

1. Name the ability in stable domain language without prescribing its current
   realization.
2. Create its canonical file using the `Capability` type and common fields from
   the [application profile](../architecture-documentation/software-architecture-application-profile.md#capability).
3. State the bearer, level, ability, and intended outcome. Make enterprise,
   system, and subsystem capabilities distinguishable.
4. Define exclusions that prevent overlap with neighboring capabilities and
   with features, processes, or structural elements.
5. Include decomposition only when each child remains an ability at a declared
   level. Use an adjacent same-named directory only when that hierarchy serves
   a real browsing need.
6. Link consequential jobs, use cases that exercise the ability, features,
   surfaces, domain authorities, C4 realization, constraints, and evidence,
   then update `capabilities/index.md`.

## Final check

- The bearer and level are explicit.
- The capability is an ability, not its desired result or implementation.
- Decomposition preserves ability semantics and consistent scope.
- Relationships show realization without making another view subordinate.
- Related use cases exercise the ability without redefining it as a goal or
  flow.

## Related

- [Capabilities in software architecture](../foundations/capabilities.md)
- [Goal-oriented behavior and use cases](../foundations/goal-oriented-behavior.md)
- [Documenting use cases](documenting-use-cases.md)
- [Documenting features](documenting-features.md)
