---
type: Guide
title: Documenting C4 views
description: How to create one selected C4 View that answers a primary question using consistent canonical elements and relationships.
tags: [architecture-documentation, c4-model, views, diagrams, notation, authoring]
status: draft
sources:
  - resource: ../foundations/c4-model.md
    title: C4 model
  - resource: ../foundations/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: ../architecture-documentation/software-architecture-application-profile.md#c4-view
    title: Software architecture docs application profile — C4 View
generated: { by: codex/gpt-5.6, at: 2026-08-21T23:00:52Z }
---

# Documenting C4 views

## Goal

Create one `C4 View` concept under `structure/views/` that answers one primary
structural, dynamic, or deployment question for a defined audience and scope.

## Before you begin

Choose a view only when it adds useful communication. Reuse canonical C4
systems, containers, and components rather than redefining them in the view.
System-context and container views are normally sufficient; add other views
only for a consequential question.

## Steps

1. State the scope and primary question, then choose exactly one profile
   `view_type`: `system-landscape`, `system-context`, `container`, `component`,
   `code`, `dynamic`, or `deployment`.
2. Create the canonical file at the corresponding views path using the `C4
   View` type and fields from the [application profile](../architecture-documentation/software-architecture-application-profile.md#c4-view).
3. Select only the people and canonical C4 elements needed to answer the
   question. Preserve each element's name, type, and responsibility.
4. Make interactions directional and label their meaning. Include
   consequential technology, protocols, and notation explanations; add a
   legend when visual conventions are not self-evident.
5. For a dynamic view, name the originating feature, use case, or behavior and
   select exactly one scenario. Identify the initiator, intended or terminal
   outcome, and ordered interactions. When the scenario comes from a Use Case,
   link it and distinguish the main success scenario from a named extension;
   show consequential state, policy, authority, recovery, or trust-boundary
   handoffs.
6. For a deployment view, name the environment and map instances to
   infrastructure. Generate code, component, container, and deployment views
   from authoritative sources when they primarily communicate current
   realization and generation is practical. Manually maintain only durable
   boundaries, responsibilities, and consequences that cannot be inferred.
7. Link the view from `structure/views/index.md` and from the concepts whose
   readers need it. Keep the canonical elements authoritative.

## Final check

- One audience, scope, and question govern the view.
- Every shown element has a clear C4 type, name, and responsibility.
- Relationships are directional and meaningful, not unlabeled lines.
- A dynamic view traces one named scenario from initiator to outcome and links
  its originating behavior when that concept is maintained.
- The visual materially improves comprehension and does not copy a current
  realization that an authoritative generated view can provide.
- The view does not replace or fork the canonical element concepts.

## Related

- [C4 model](../foundations/c4-model.md)
- [Goal-oriented behavior and use cases](../foundations/goal-oriented-behavior.md)
- [Documenting use cases](documenting-use-cases.md)
- [Just Enough Architecture Docs](../architecture-documentation/just-enough-architecture-docs.md)
- [Documenting C4 software systems](documenting-c4-software-systems.md)
