---
type: Guide
title: Documenting features
description: Use when recognizable optional behavior needs durable identity beyond one use case, surface, implementation, or host-native planning record; create one Feature concept.
tags: [architecture-documentation, features, behavior, actors, evidence, authoring]
status: draft
sources:
  - resource: /architecture/capabilities/capabilities.md
    title: Capabilities in software architecture
  - resource: /intent/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: /profile/gen-stack-application-profile.md#feature
    title: Gen Stack application profile — Feature
generated: { by: codex/gpt-5.6, at: "2026-08-27T01:11:07Z" }
---

# Documenting features

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one optional `Feature` concept under `architecture/features/` for independently
recognizable behavior that matters across one or more use cases, surfaces, or
realizations.

## Before you begin

Document a feature only when its durable behavior or boundary matters beyond
the work that delivered it and beyond merely paraphrasing one use case. If the
candidate has no independent cross-use, cross-surface, policy, or realization
meaning, omit the Feature and link directly from the Use Case to its other
architecture views. Keep prioritization, release state, estimates, and
implementation tasks in their host-native planning authority.

## Representation

Use the OKF envelope, the profile's exact `Feature` type and collection, and
controlled relationships in their native roles. Present residual body meaning
in this preferred order: recognizable outcome, actors and conditions, behavior
and boundaries, material exclusions, related Use Cases, Capabilities,
Surfaces, and C4 elements, then evidence. Keep delivery state and tracker
metadata out of the concept and do not duplicate frontmatter edges. This order
is authoring guidance, not profile conformance.

## Steps

1. Name the recognizable behavior in actor or domain language rather than by
   project code name or implementation component.
2. Create its canonical file using the `Feature` type and common fields from
   the [application profile](/profile/gen-stack-application-profile.md#feature).
3. State the actors, conditions, recognizable behavior, and intended outcome.
   Explain why this behavior has durable identity independent of one use case.
4. Explain material exclusions and failure context shared across use cases,
   surfaces, or implementations. Link accepted behavior, invariant, failure,
   or recovery Requirements rather than restating their binding outcomes.
5. Record controlled edges under `relationships.enables-use-case`,
   `relationships.contributes-to-capability`,
   `relationships.is-available-through-surface`, and
   `relationships.is-realized-by-c4-element` as applicable. Explain domain
   authority in prose.
6. Do not author derived reciprocal endpoint roles independently. Link tests or
   executable examples that own precise supported scenarios,
   then update `architecture/features/index.md`.

## Final check

- The feature is recognizable to an actor, not merely an internal mechanism.
- It has independent meaning rather than restating one actor goal and scenario.
- Its meaning survives completion of the change that introduced it.
- It remains distinct from provider capability and interaction surface.
- Accepted behavior and failure obligations have one linked Requirement
  authority.
- Exact behavior inventories remain with executable evidence.
- Relationship synchronization reports no changes.

## Related

- [Capabilities in software architecture](/architecture/capabilities/capabilities.md)
- [Goal-oriented behavior and use cases](/intent/goal-oriented-behavior.md)
- [Documenting use cases](/intent/documenting-use-cases.md)
- [Documenting capabilities](/architecture/capabilities/documenting-capabilities.md)
- [Documenting surfaces](/architecture/surfaces/documenting-surfaces.md)
