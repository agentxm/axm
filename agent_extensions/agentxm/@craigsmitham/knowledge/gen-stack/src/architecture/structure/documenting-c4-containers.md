---
type: Guide
title: Documenting C4 containers
description: Use when an accepted application or data-store boundary inside a declared Software System needs canonical identity; record one C4 Container with its responsibility and technology boundary.
tags: [architecture-documentation, c4-model, containers, applications, data-stores, authoring]
status: draft
sources:
  - resource: /architecture/structure/c4-model.md
    title: C4 model
  - resource: /profile/gen-stack-application-profile.md#c4-container
    title: Gen Stack application profile — C4 Container
generated: { by: codex/gpt-5.6, at: "2026-08-27T01:11:07Z" }
---

# Documenting C4 containers

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `C4 Container` concept under `architecture/structure/containers/` for an
application or data store inside exactly one software system.

## Before you begin

Confirm that the runtime boundary, responsibility, and one containing Software
System are accepted. When those are still inferred, underdeveloped, misplaced,
or disputed, use [Developing C4 structure](developing-c4-structure.md) first.
Direct accepted authoring does not require repeating candidate development.

Identify exactly one containing software system and a real application or data-store
boundary. A C4 Container is not necessarily a Docker container, deployment
node, infrastructure tier, team, or Bounded Context.

## Representation

Use the OKF envelope, the profile's exact `C4 Container` type and collection,
and the native `belongs-to-c4-software-system` assertion. Present residual body
meaning in this preferred order: owning Software System and runtime boundary,
responsibilities, interfaces, dependencies and data, operational constraints,
material exclusions, Component navigation, and evidence. Do not repeat
containment or generated inventories in the body. This order is authoring
guidance, not profile conformance.

## Steps

1. Name the application or data store consistently with the C4 model and
   current evidence. Identify exactly one containing C4 Software System.
2. Create its canonical file using the `C4 Container` type and common fields
   from the [application profile](/profile/gen-stack-application-profile.md#c4-container).
   Record its one containing System under
   `relationships.belongs-to-c4-software-system`.
3. State its runtime boundary, containing software system, and one concise
   active responsibility naming the outcome, policy, state, or authority it
   owns. Add material non-responsibilities rather than inventorying functions.
4. Record consequential technology choices only when they help explain the
   boundary or constrain change.
5. Identify boundary-crossing interactions by direction and meaning. Do not
   represent another container as contained within it.
6. Inherit lifecycle, ownership, decision-policy, and assurance context from
   the containing system's required root concepts. Record only a consequential
   exception, such as a distinct owner, lifecycle, criticality, support policy,
   or retirement path.
7. Treat System and path-derived Component containment views as derived.
8. Link capabilities, surfaces, bounded contexts, accepted Requirements,
   deployment evidence, and selected views. Explain how the boundary responds
   to linked invariant or guarantee Requirements without repeating their
   binding statements. Add the concept to `architecture/structure/containers/index.md`.

## Final check

- The subject identifies exactly one containing C4 Software System.
- It contains no other C4 containers.
- Responsibility and runtime boundary are clearer than technology alone.
- Material non-responsibilities keep adjacent ownership outside the boundary.
- Parent system context is not repeated without a meaningful
  exception.
- Infrastructure placement remains in deployment views.
- Relationship synchronization reports no changes.

## Related

- [C4 model](/architecture/structure/c4-model.md)
- [Documenting C4 components](documenting-c4-components.md)
- [Documenting C4 views](documenting-c4-views.md)
- [Reviewing responsibilities with scenarios](/architecture/reviewing-responsibilities-with-scenarios.md)
