---
type: Guide
title: Documenting surfaces
description: How to create one Surface concept that defines an actor-facing encounter point independently of its structural realization.
tags: [architecture-documentation, surfaces, interactions, applications, apis, authoring]
status: draft
sources:
  - resource: ../foundations/capabilities.md
    title: Capabilities in software architecture
  - resource: ../foundations/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: ../architecture-documentation/software-architecture-application-profile.md#surface
    title: Software architecture docs application profile — Surface
generated: { by: codex/gpt-5.6, at: 2026-08-21T22:12:04Z }
---

# Documenting surfaces

## Goal

Create one `Surface` concept under `surfaces/` that defines where actors
encounter system behavior.

## Before you begin

Use a surface when an application, API, command line, protocol, device, or
console has a consequential interaction boundary. Do not infer its C4 type
from its interaction role.

## Steps

1. Name the encounter point in language its actors and maintainers recognize.
2. Create its canonical file using the `Surface` type and common fields from
   the [application profile](../architecture-documentation/software-architecture-application-profile.md#surface).
3. Identify the actors in scope and the interaction boundary they encounter.
4. State the recognizable behavior available there and material exclusions
   from adjacent surfaces. Do not copy the actor goal or scenario owned by a
   Use Case; one use case may be enacted through several surfaces.
5. Record accessibility, trust, protocol, availability, or operational
   constraints only when they materially shape the interaction.
6. Link features available through the surface, use cases it supports, C4
   elements realizing it, and relevant evidence, then update `surfaces/index.md`.

## Final check

- The document answers where actors encounter behavior.
- It does not redefine every feature exposed through the surface.
- It exposes use-case behavior without claiming ownership of the goal or
  scenario.
- Interaction meaning remains distinct from runtime structure.
- Material constraints and realization evidence are linked, not duplicated.

## Related

- [Capabilities in software architecture](../foundations/capabilities.md)
- [Goal-oriented behavior and use cases](../foundations/goal-oriented-behavior.md)
- [Documenting features](documenting-features.md)
- [Documenting C4 containers](documenting-c4-containers.md)
