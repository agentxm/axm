---
type: Guide
title: Documenting C4 components
description: Use when an accepted cohesive responsibility inside one C4 Container needs canonical identity; record one Component with a defined interface and exactly one owning Container.
tags: [architecture-documentation, c4-model, components, interfaces, containment, authoring]
status: draft
sources:
  - resource: /architecture/structure/c4-model.md
    title: C4 model
  - resource: /profile/gen-stack-application-profile.md#c4-component
    title: Gen Stack application profile — C4 Component
generated: { by: codex/gpt-5.6, at: "2026-08-26T20:18:00Z" }
---

# Documenting C4 components

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `C4 Component` concept beneath exactly one owning container at
`architecture/structure/containers/<container>/components/`.

## Before you begin

Confirm that the responsibility, interface, and one owning Container are
accepted. When those are still inferred from code or remain underdeveloped,
misplaced, or disputed, use [Developing C4
structure](developing-c4-structure.md) first. Direct accepted authoring does
not require repeating candidate development.

Use a Component only for architecturally significant functionality
encapsulated behind a defined interface inside one Container. A package,
folder, service name, shared library, or Bounded Context is not automatically
a C4 Component.

## Representation

Use the OKF envelope, the profile's exact `C4 Component` type, and its
path-derived owning Container. Present residual body meaning in this preferred
order: cohesive responsibility, interfaces, dependencies, data or state
concerns, material exclusions, Architecture relationships, and evidence. Keep
owning-Container projections and other native relationship fields out of a
duplicate body inventory. This order is authoring guidance, not profile
conformance.

## Steps

1. Identify the one container in which the functionality executes and is
   deployed.
2. Name the component for its cohesive responsibility rather than its current
   implementation class or package.
3. Create its canonical file using the `C4 Component` type and fields from the
   [application profile](/profile/gen-stack-application-profile.md#c4-component), at the owning-container path.
   The path is the containment assertion; do not author an independent parent.
4. State one concise active responsibility, its defined interface, material
   non-responsibilities, and consequential technology. Check that the name,
   interface, state, and dependencies align with the outcome, policy, state,
   or authority the component claims to own.
5. Identify dependencies and interactions by direction and meaning. Do not
   recursively contain components or duplicate one component under several
   containers.
6. Inherit lifecycle, ownership, decision-policy, and assurance context through
   the owning container from the system's required root concepts. Record only
   a consequential exception.
7. From the repository root, run `scripts/sync-gen-stack-relationships.py` to materialize
   `belongs-to-c4-container` here and `contains-c4-component` on the Container.
8. Link domain authority, capabilities, features, accepted Requirements, code
   evidence, and selected component views. Explain the component's structural
   response to linked invariant or guarantee Requirements without restating
   their binding predicates, then update the owning components index.

## Final check

- The component has one cohesive responsibility and defined interface.
- Its material non-responsibilities keep adjacent ownership outside the
  boundary.
- Its path proves exactly one owning container.
- It contains no C4 components recursively.
- Parent system context is not repeated without a meaningful
  exception.
- Shared code remains a dependency unless it has the required component boundary.
- Relationship synchronization reports no changes.

## Related

- [C4 model](/architecture/structure/c4-model.md)
- [Documenting C4 containers](documenting-c4-containers.md)
- [Documenting C4 views](documenting-c4-views.md)
- [Reviewing responsibilities with scenarios](/architecture/reviewing-responsibilities-with-scenarios.md)
