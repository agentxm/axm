---
type: Guide
title: Documenting use cases
description: How to create one architecture Use Case with a subject, contextual actors, goal scope, main success scenario, material extensions, cross-view links, and precise evidence kept elsewhere.
tags: [architecture-documentation, use-cases, actors, goals, scenarios, extensions, evidence, authoring]
status: draft
sources:
  - resource: ../foundations/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: ../architecture-documentation/software-architecture-application-profile.md#use-case
    title: Software architecture docs application profile — Use Case
generated: { by: codex/gpt-5.6, at: 2026-08-21T23:00:52Z }
---

# Documenting use cases

## Goal

Create one `Use Case` concept under `use-cases/` that explains how a named
subject behaves so a primary actor can achieve a goal and connects that
behavior to the architecture that makes it possible.

## Before you begin

Confirm that goal-oriented behavior carries durable meaning that architecture
readers cannot infer reliably from tests or interfaces alone. Start from the
subject boundary and an actor-goal inventory; expand only goals whose value,
risk, ambiguity, or architectural consequences justify maintenance. A Job to
Be Done may explain motivating demand, but it does not replace the use case.

## Steps

1. Name the use case with an active goal verb phrase, such as “Confirm a
   reservation,” rather than a screen, endpoint, noun label, or delivery item.
   Add the actor to the title only when it distinguishes otherwise different
   goals.
2. Create its canonical file under `use-cases/` using the `Use Case` type and
   common fields from the [application profile](../architecture-documentation/software-architecture-application-profile.md#use-case).
   Even when this is the first use case, create `use-cases/index.md` and the
   named concept file; never begin with a plural `use-cases.md` inventory.
3. Name the subject boundary, normally an Offering or C4 Software System.
   Identify the primary actor role and successful outcome. Name supporting
   actors or external services only when their collaboration matters.
4. Classify the goal scope as `summary`, `user-goal`, or `subfunction`.
   Prefer `user-goal`; use a summary for broader context and a subfunction only
   when reuse or complexity gives it independent architectural meaning. Keep
   action-sized fragments in scenarios, requirements, stories, or tests.
5. Write a concise, technology-neutral main success scenario. Use active steps
   that alternate actor intent with subject responsibility. Avoid UI gestures,
   protocol messages, component calls, or data-field inventories unless they
   are themselves durable architectural decisions.
6. List the extension conditions that expose consequential policy, state,
   failure, trust, recovery, or collaborator behavior. Then state their
   handling or terminal outcome. Do not enumerate every test variation.
7. State exclusions and connect the use case to the relevant capabilities it
   exercises, independently meaningful features that enable it, surfaces
   through which it is enacted, bounded contexts whose authority it uses, C4
   elements that realize it, and dynamic views that illustrate selected
   scenarios.
8. Link requirements, contracts, tests, executable examples, and runtime
   evidence that own precise or current facts. Review the result with both
   domain or value participants and technical participants, then update
   `use-cases/index.md`.

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
- At step 2, the payment provider is unavailable: the platform preserves the
  accepted recovery policy and reports the resulting reservation state.

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
- Exact permutations and current facts remain with their better authorities.
- The use case is neither the underlying Job to Be Done nor a delivery story.

## Related

- [Goal-oriented behavior and use cases](../foundations/goal-oriented-behavior.md)
- [Offerings and value in software architecture](../foundations/offerings-and-value.md)
- [Documenting Jobs to Be Done](documenting-jobs-to-be-done.md)
- [Documenting features](documenting-features.md)
- [Documenting C4 views](documenting-c4-views.md)
- [Reviewing responsibilities with scenarios](reviewing-responsibilities-with-scenarios.md)
