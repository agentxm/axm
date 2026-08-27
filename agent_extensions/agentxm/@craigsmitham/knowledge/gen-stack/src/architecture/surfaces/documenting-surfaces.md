---
type: Guide
title: Documenting surfaces
description: Use when an accepted actor-facing encounter point needs canonical identity independent of its structural realization; record one Surface concept and its earned navigation.
tags: [architecture-documentation, surfaces, interactions, applications, apis, authoring]
status: draft
sources:
  - resource: /architecture/capabilities/capabilities.md
    title: Capabilities in software architecture
  - resource: /intent/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: /profile/gen-stack-application-profile.md#surface
    title: Gen Stack application profile — Surface
generated: { by: codex/gpt-5.6, at: "2026-08-26T20:18:00Z" }
---

# Documenting surfaces

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `Surface` concept under `architecture/surfaces/` that defines where actors
encounter system behavior.

## Before you begin

Confirm that the applicable authority has accepted the Surface identity,
interaction boundary, actors, and material relationships. When those are still
missing, inferred, underdeveloped, misplaced, or disputed, use [Developing
Surfaces](developing-surfaces.md) first. Direct accepted authoring does not
require repeating that candidate-development workflow.

Use a Surface when an application, API, command line, protocol, device, or
console has a consequential interaction boundary. Do not infer its C4 type
from its interaction role.

## Representation

Use the OKF envelope, the profile's exact `Surface` type and canonical path,
including nested path semantics for a narrower Surface. Present residual body
meaning in this preferred order: actors and encounter boundary, recognizable
behavior, scope and exclusions, interaction hierarchy, Feature and C4
relationships, and evidence. Keep path-derived containment and synchronized
relationship roles out of duplicate body metadata. This order is authoring
guidance, not profile conformance.

## Steps

1. Name the encounter point in language its actors and maintainers recognize.
2. Create its canonical file using the `Surface` type and common fields from
   the [application profile](/profile/gen-stack-application-profile.md#surface).
   A surface may use a same-named adjacent directory for independently named
   narrower surfaces, such as a CLI command or subcommand.
3. Identify the actors in scope and the interaction boundary they encounter.
4. State the recognizable behavior available there and material exclusions
   from adjacent surfaces. Do not copy the actor goal or scenario owned by a
   Use Case; one use case may be enacted through several surfaces.
5. Explain accessibility, trust, protocol, availability, or operational
   concerns only when they materially shape the interaction. Link accepted
   obligations as subject-colocated Requirements rather than recording
   constraints in the Surface prose.
6. Record controlled C4 mappings under
   `relationships.is-realized-by-c4-element`. Features own
   `is-available-through-surface`; do not duplicate the reciprocal here.
   Canonical nested paths own parent-child Surface containment.
7. From the repository root, run `scripts/sync-gen-stack-relationships.py`, link relevant
   evidence, colocate accepted obligations beneath
   `requirements/<requirement_type>/`, and update the immediate Surface index.

## Final check

- The document answers where actors encounter behavior.
- It does not redefine every feature exposed through the surface.
- It exposes use-case behavior without claiming ownership of the goal or
  scenario.
- Interaction meaning remains distinct from runtime structure.
- Material constraints and realization evidence are linked, not duplicated.
- Recursive surface navigation communicates the product interaction model,
  not the test runner's suite hierarchy.
- Relationship synchronization reports no changes.

## Related

- [Capabilities in software architecture](/architecture/capabilities/capabilities.md)
- [Goal-oriented behavior and use cases](/intent/goal-oriented-behavior.md)
- [Documenting features](/architecture/features/documenting-features.md)
- [Documenting C4 containers](/architecture/structure/documenting-c4-containers.md)
