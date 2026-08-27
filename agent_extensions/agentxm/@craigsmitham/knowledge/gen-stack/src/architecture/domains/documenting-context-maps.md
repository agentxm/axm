---
type: Guide
title: Documenting context maps
description: Use when relationships between Bounded Contexts need explicit direction and consequences; create one Context Map concept that makes them visible.
tags: [architecture-documentation, ddd, context-maps, integration, dependencies, authoring]
status: draft
sources:
  - resource: /architecture/domains/domain-driven-design.md
    title: Domain-driven design
  - resource: /profile/gen-stack-application-profile.md#context-map
    title: Gen Stack application profile — Context Map
generated: { by: codex/gpt-5.6, at: "2026-08-27T01:11:07Z" }
---

# Documenting context maps

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `Context Map` concept under `architecture/domains/context-maps/` that owns a
maintained relationship view among bounded contexts.

## Before you begin

Identify the contexts and accepted integration consequences in scope. Do not
create an untyped box diagram or infer relationships only from current network
calls and dependencies.

## Representation

Use the OKF envelope, the profile's exact `Context Map` type and collection,
and `relates-bounded-context` for its participating contexts. Present residual
body meaning in this preferred order: map question and scope, directional
dependencies, translation boundaries, coordination choices, consequences,
and evidence. A diagram may support that order but must not become the only
owner of direction or meaning; do not duplicate reciprocal frontmatter. This
order is authoring guidance, not profile conformance.

## Steps

1. Choose a map scope that one reader can reason about coherently: a system,
   domain area, or consequential integration boundary.
2. Create its canonical file using the `Context Map` type and common fields
   from the [application profile](/profile/gen-stack-application-profile.md#context-map).
3. Record every Bounded Context in scope under
   `relationships.relates-bounded-context`. A Context Map requires at least one
   such target.
4. For each material relationship, state dependency direction, influence,
   translation or published-language boundary, and the meaning exchanged.
5. Identify consistency, compatibility, failure, recovery, and coordination
   concerns. Link accepted Requirements on eligible Bounded Context or
   structural subjects; do not make the Context Map their normative owner.
6. Treat `participates-in-context-map` on each context as a derived reciprocal
   view.
7. Explain accepted consequences and link current interface, schema, test, or
   runtime evidence without copying it. Update
   `architecture/domains/context-maps/index.md`.

## Final check

- Every relationship has direction and meaning.
- Translation and ownership boundaries are visible.
- Consequential failure and consistency Requirements are linked without
  becoming obligations of the Context Map.
- Individual context documents do not maintain competing copies of the map.
- Relationship synchronization reports no changes.

## Related

- [Domain-driven design](/architecture/domains/domain-driven-design.md)
- [Documenting bounded contexts](documenting-bounded-contexts.md)
