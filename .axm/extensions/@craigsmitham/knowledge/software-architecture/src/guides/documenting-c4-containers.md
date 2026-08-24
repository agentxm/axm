---
type: Guide
title: Documenting C4 containers
description: How to create one C4 Container concept for an application or data store inside a declared software system.
tags: [architecture-documentation, c4-model, containers, applications, data-stores, authoring]
status: draft
sources:
  - resource: ../foundations/c4-model.md
    title: C4 model
  - resource: ../architecture-documentation/software-architecture-application-profile.md#c4-container
    title: Software architecture docs application profile — C4 Container
generated: { by: codex/gpt-5.6, at: 2026-08-22T00:17:07Z }
---

# Documenting C4 containers

## Goal

Create one `C4 Container` concept under `structure/containers/` for an
application or data store inside exactly one software system.

## Before you begin

Identify exactly one containing software system and a real application or data-store
boundary. A C4 container is not necessarily a Docker container, deployment
node, infrastructure tier, team, or bounded context.

## Steps

1. Name the application or data store consistently with the C4 model and
   current evidence. Identify exactly one containing C4 Software System.
2. Create its canonical file using the `C4 Container` type and common fields
   from the [application profile](../architecture-documentation/software-architecture-application-profile.md#c4-container).
3. State its runtime boundary, containing software system, and one concise
   active responsibility naming the outcome, policy, state, or invariant it
   owns. Add material non-responsibilities rather than inventorying functions.
4. Record consequential technology choices only when they help explain the
   boundary or constrain change.
5. Identify boundary-crossing interactions by direction and meaning. Do not
   represent another container as contained within it.
6. Inherit lifecycle, support, maintenance, and decision-authority context from
   the containing system. Record only a consequential exception, such as a
   distinct owner, lifecycle, criticality, support policy, or retirement path.
7. Link capabilities, surfaces, bounded contexts, deployment evidence, and
   selected views. Add the concept to `structure/containers/index.md`.

## Final check

- The subject identifies exactly one containing C4 Software System.
- It contains no other C4 containers.
- Responsibility and runtime boundary are clearer than technology alone.
- Material non-responsibilities keep adjacent ownership outside the boundary.
- Parent stewardship and lifecycle are not repeated without a meaningful
  exception.
- Infrastructure placement remains in deployment views.

## Related

- [C4 model](../foundations/c4-model.md)
- [Documenting C4 components](documenting-c4-components.md)
- [Documenting C4 views](documenting-c4-views.md)
- [Reviewing responsibilities with scenarios](reviewing-responsibilities-with-scenarios.md)
