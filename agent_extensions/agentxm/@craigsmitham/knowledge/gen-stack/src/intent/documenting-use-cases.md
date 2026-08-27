---
type: Guide
title: Documenting use cases
description: Use when actor-goal interactions need a scenario-centered behavioral view; create one Use Case with contextual actors, goal scope, success path, material extensions, cross-view links, and evidence kept elsewhere.
tags: [architecture-documentation, use-cases, actors, goals, scenarios, extensions, evidence, authoring]
status: draft
sources:
  - resource: goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: ../profile/gen-stack-application-profile.md#use-case
    title: Gen Stack application profile — Use Case
generated: { by: codex/gpt-5.6, at: "2026-08-27T01:11:07Z" }
---

# Documenting use cases

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `Use Case` concept under `intent/use-cases/` that explains how a named
subject behaves so a primary actor can achieve a goal and connects that
behavior to the architecture that makes it possible.

## Before you begin

Confirm that goal-oriented behavior carries durable meaning that architecture
readers cannot infer reliably from tests or interfaces alone. Start from the
subject boundary and an actor-goal inventory; expand only goals whose value,
risk, ambiguity, or architectural consequences justify maintenance. A Job to
Be Done may explain motivating demand, but it does not replace the use case.

## Representation

Use the OKF envelope, the profile's exact `Use Case` type and collection, and
controlled relationships in their profile roles. The [suggested
body](#suggested-body) is the preferred residual order: subject and actors,
goal and outcome, main success scenario, material extensions, then Architecture
relationships and evidence. Vary prose and proportional detail, omit
inapplicable extensions, and do not duplicate frontmatter or Requirement
expressions. The suggested headings are not additional profile conformance.

## Steps

1. Name the use case with an active goal verb phrase, such as “Confirm a
   reservation,” rather than a screen, endpoint, noun label, or host-native planning record.
   Add the actor to the title only when it distinguishes otherwise different
   goals.
2. Create its canonical file under `intent/use-cases/` using the `Use Case` type and
   common fields from the [application profile](../profile/gen-stack-application-profile.md#use-case).
   Even when this is the first use case, create `intent/use-cases/index.md` and the
   named concept file; never begin with a plural `use-cases.md` inventory.
3. Name the interaction subject boundary, normally an Offering or C4 Software
   System. This role does not make an Offering eligible as a Requirement
   subject. Identify the primary actor role and successful outcome. Name
   supporting actors or external services only when their collaboration
   matters.
4. Classify the goal scope as `summary`, `user-goal`, or `subfunction`.
   Prefer `user-goal`; use a summary for broader context and a subfunction only
   when reuse or complexity gives it independent architectural meaning. Keep
   action-sized fragments in scenarios, requirements, stories, or tests.
5. Write a concise, technology-neutral main success scenario. Use active steps
   that alternate actor intent with subject responsibility. Avoid UI gestures,
   protocol messages, component calls, or data-field inventories unless they
   are themselves durable architectural decisions.
6. List the extension conditions that expose consequential policy, state,
   failure, trust, recovery, or collaborator behavior. Then describe their
   handling or terminal outcome as scenario context. When the outcome is an
   independently accepted obligation, link its Requirement rather than using a
   binding `shall` statement or maintaining a second normative formulation. Do
   not enumerate every test variation.
7. State exclusions. Record each controlled Capability edge under
   `relationships.exercises-capability`. Features author
   `enables-use-case`; do not duplicate its reciprocal here. Explain surfaces,
   domain authority, realization, and selected dynamic views in prose where no
   controlled role applies.
8. Treat reciprocal views and Requirement-source backlinks as derived.
9. Link Requirements that own accepted obligations and contracts, tests,
   executable examples, and runtime evidence that own precise or current
   facts. Review the result with both domain or value participants and
   technical participants, then update `intent/use-cases/index.md`.

## Suggested body

Use this shape when the repository has no stronger template. Omit a section
only when its meaning is genuinely inapplicable, not merely unknown.

```markdown
# Confirm a reservation

## Subject and actors

- Subject: Reservation platform
- Primary actor: Traveler
- Supporting actors: Payment provider

## Goal and outcome

- Goal scope: user-goal
- Goal: Turn an eligible capacity hold into a confirmed reservation.
- Successful outcome: The reservation is confirmed and the capacity promise is preserved.

## Main success scenario

1. Traveler asks to confirm an eligible hold.
2. Reservation platform validates the hold and required confirmation details.
3. Reservation platform confirms the reservation and reports the outcome.

## Material extensions

- At step 2, the hold has expired: the platform refuses confirmation, releases
  any remaining provisional state, and reports that the goal was not achieved.
- At step 2, the payment provider is unavailable: the linked recovery
  Requirements govern the terminal outcome and the platform reports the
  resulting reservation state.

## Architecture relationships and evidence

- Exercises: Reservation management capability
- Enacted through: Traveler checkout surface
- Uses authority from: Reservations bounded context
- Illustrated by: Reservation confirmation dynamic view
- Precise evidence: Confirmation contract and executable acceptance examples
```

## Final check

- The subject, primary actor role, goal scope, goal, and outcome are explicit.
- The main success scenario is readable without knowing the UI or internal
  component design.
- Extensions are selective and architecturally consequential.
- Actor remains contextual; Audience, external system, and actor role are not
  treated as synonyms.
- Related architecture views are connected with meaningful prose links.
- Accepted scenario obligations have one linked Requirement authority.
- Exact permutations and current facts remain with their better authorities.
- The use case is neither the underlying Job to Be Done nor a delivery story.
- Relationship synchronization reports no changes.

## Related

- [Goal-oriented behavior and use cases](goal-oriented-behavior.md)
- [Offerings and value in software architecture](offerings-and-value.md)
- [Documenting Jobs to Be Done](documenting-jobs-to-be-done.md)
- [Documenting features](/architecture/features/documenting-features.md)
- [Documenting C4 views](/architecture/structure/documenting-c4-views.md)
- [Reviewing responsibilities with scenarios](/architecture/reviewing-responsibilities-with-scenarios.md)
