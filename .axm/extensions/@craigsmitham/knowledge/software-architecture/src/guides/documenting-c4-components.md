---
type: Guide
title: Documenting C4 components
description: How to create one C4 Component concept with a cohesive responsibility, defined interface, and exactly one owning container.
tags: [architecture-documentation, c4-model, components, interfaces, containment, authoring]
status: draft
sources:
  - resource: ../foundations/c4-model.md
    title: C4 model
  - resource: ../architecture-documentation/software-architecture-application-profile.md#c4-component
    title: Software architecture docs application profile — C4 Component
generated: { by: codex/gpt-5.6, at: 2026-08-21T23:46:55Z }
---

# Documenting C4 components

## Goal

Create one `C4 Component` concept beneath exactly one owning container at
`structure/containers/<container>/components/`.

## Before you begin

Use a component only for architecturally significant functionality
encapsulated behind a defined interface inside one container. A package,
folder, service name, shared library, or bounded context is not automatically
a C4 component.

## Steps

1. Identify the one container in which the functionality executes and is
   deployed.
2. Name the component for its cohesive responsibility rather than its current
   implementation class or package.
3. Create its canonical file using the `C4 Component` type and fields from the
   [application profile](../architecture-documentation/software-architecture-application-profile.md#c4-component), at the owning-container path.
4. State one concise active responsibility, its defined interface, material
   non-responsibilities, and consequential technology. Check that the name,
   interface, state, and dependencies align with the outcome, policy, state,
   or invariant the component claims to own.
5. Identify dependencies and interactions by direction and meaning. Do not
   recursively contain components or duplicate one component under several
   containers.
6. Inherit lifecycle, support, maintenance, and decision-authority context
   through the owning container. Record only a consequential exception.
7. Link domain authority, capabilities, features, code evidence, and selected
   component views, then update the owning components index.

## Final check

- The component has one cohesive responsibility and defined interface.
- Its material non-responsibilities keep adjacent ownership outside the
  boundary.
- Its path proves exactly one owning container.
- It contains no C4 components recursively.
- Parent stewardship and lifecycle are not repeated without a meaningful
  exception.
- Shared code remains a dependency unless it has the required component boundary.

## Related

- [C4 model](../foundations/c4-model.md)
- [Documenting C4 containers](documenting-c4-containers.md)
- [Documenting C4 views](documenting-c4-views.md)
- [Reviewing responsibilities with scenarios](reviewing-responsibilities-with-scenarios.md)
