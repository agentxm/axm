---
type: Guide
title: Documenting C4 views
description: Use when accepted C4 elements need a selected perspective for one architectural question; record one View using consistent canonical elements and relationships.
tags: [architecture-documentation, c4-model, views, diagrams, notation, authoring]
status: draft
sources:
  - resource: /architecture/structure/c4-model.md
    title: C4 model
  - resource: /intent/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: /profile/gen-stack-application-profile.md#c4-view
    title: Gen Stack application profile — C4 View
generated: { by: codex/gpt-5.6, at: "2026-08-26T20:18:00Z" }
---

# Documenting C4 views

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `C4 View` concept under `architecture/structure/views/` that answers one primary
structural, dynamic, or deployment question for a defined audience and scope.

## Before you begin

Confirm that the view question and every projected C4 element are accepted or
canonical. When element identity, responsibility, containment, or interaction
is still inferred or disputed, use [Developing C4
structure](developing-c4-structure.md) first. Direct accepted authoring does
not require repeating candidate development.

Choose a View only when it adds useful communication. Reuse canonical C4
Software Systems, Containers, and Components rather than redefining them in
the View. System-context and Container views are normally sufficient; add
other Views only for a consequential question.

## Representation

Use the OKF envelope, the profile's exact `C4 View` type, native `view_type`,
canonical path, and `projects-c4-element` relationship. Present residual body
meaning in this preferred order: architecture question, scope and audience,
projected canonical elements, consequential relationships, the diagram or
other view, interpretation limits, and evidence. Do not let the view recreate
or own projected elements, and do not duplicate native projection lists. This
order is authoring guidance, not profile conformance.

## Steps

1. State the scope and primary question, then choose exactly one profile
   `view_type`: `system-landscape`, `system-context`, `container`, `component`,
   `code`, `dynamic`, or `deployment`.
2. Create the canonical file at the corresponding views path using the `C4
   View` type and fields from the [application profile](/profile/gen-stack-application-profile.md#c4-view).
3. Select only the people and canonical C4 elements needed to answer the
   question. Record one or more selected C4 elements under
   `relationships.projects-c4-element`; preserve each element's name, type,
   and responsibility.
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
7. From the repository root, run `scripts/sync-gen-stack-relationships.py` to materialize
   `appears-in-c4-view` on each governed element.
8. Link the view from `architecture/structure/views/index.md` and from the concepts whose
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
- Relationship synchronization reports no changes.

## Related

- [C4 model](/architecture/structure/c4-model.md)
- [Goal-oriented behavior and use cases](/intent/goal-oriented-behavior.md)
- [Documenting use cases](/intent/documenting-use-cases.md)
- [Gen Stack application profile for OKF v0.2](/profile/gen-stack-application-profile.md)
- [Documenting C4 software systems](documenting-c4-software-systems.md)
