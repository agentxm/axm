---
type: Guide
title: Documenting capabilities
description: Use when an outcome-oriented ability needs durable identity independent of its realization; create one Capability with a declared bearer, level, and useful boundary.
tags: [architecture-documentation, capabilities, abilities, outcomes, authoring]
status: draft
sources:
  - resource: /architecture/capabilities/capabilities.md
    title: Capabilities in software architecture
  - resource: /intent/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: /profile/gen-stack-application-profile.md#capability
    title: Gen Stack application profile — Capability
generated: { by: codex/gpt-5.6, at: "2026-08-26T20:18:00Z" }
---

# Documenting capabilities

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `Capability` concept under `architecture/capabilities/` that states an
outcome-oriented ability of an identified organization, system, or subsystem.

## Before you begin

Confirm the bearer and level. Do not create a capability merely by renaming a
feature, application, process, team, goal, or planned work item.

## Representation

Use the OKF envelope, the profile's exact `Capability` type and collection,
and controlled relationships in their native roles. Present residual body
meaning in this preferred order: bearer and outcome-oriented ability, scope
and level, responsibilities and conditions, material exclusions, relationships
to Features, Offerings, Use Cases, or C4 elements, and evidence. Do not repeat
frontmatter edges as a body inventory. This order is authoring guidance, not
profile conformance.

## Steps

1. Name the ability in stable domain language without prescribing its current
   realization.
2. Create its canonical file using the `Capability` type and common fields from
   the [application profile](/profile/gen-stack-application-profile.md#capability).
3. State the bearer, level, ability, and intended outcome. Make enterprise,
   system, and subsystem capabilities distinguishable.
4. Define exclusions that prevent overlap with neighboring capabilities and
   with features, processes, or structural elements.
5. Include decomposition only when each child remains an ability at a declared
   level. Use an adjacent same-named directory only when that hierarchy serves
   a real browsing need.
6. Record controlled C4 mappings under
   `relationships.is-realized-by-c4-element`. Offerings, Use Cases, and Features
   own their forward Capability assertions; do not duplicate the reciprocal
   roles here. Link other consequential context in prose.
7. From the repository root, run `scripts/sync-gen-stack-relationships.py`, then link
   accepted Requirements and evidence and update
   `architecture/capabilities/index.md`. Do not make the Capability statement a
   second normative formulation of those obligations.

## Final check

- The bearer and level are explicit.
- The capability is an ability, not its desired result or implementation.
- Responsibility assignments and accepted Requirement obligations remain
  distinct from the ability.
- Decomposition preserves ability semantics and consistent scope.
- Relationships show realization without making another view subordinate.
- Related use cases exercise the ability without redefining it as a goal or
  flow.
- Relationship synchronization reports no changes.

## Related

- [Capabilities in software architecture](/architecture/capabilities/capabilities.md)
- [Goal-oriented behavior and use cases](/intent/goal-oriented-behavior.md)
- [Documenting use cases](/intent/documenting-use-cases.md)
- [Documenting features](/architecture/features/documenting-features.md)
