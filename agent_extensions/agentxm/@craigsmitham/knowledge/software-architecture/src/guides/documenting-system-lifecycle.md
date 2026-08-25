---
type: Guide
title: Documenting system lifecycle
description: How to create the required System Lifecycle concept with an accepted support state, change horizon, expected evolution, and event-driven review triggers.
tags: [architecture-documentation, system-lifecycle, support, change-horizon, authoring]
status: draft
sources:
  - resource: ../architecture-documentation/software-architecture-application-profile.md#system-lifecycle
    title: Software architecture docs application profile — System Lifecycle
  - resource: ../architecture-documentation/just-enough-architecture-docs.md
    title: Just Enough Architecture Docs
generated: { by: codex/gpt-5.6, at: 2026-08-25T19:19:59Z }
---

# Documenting system lifecycle

## Goal

Create the required `System Lifecycle` concept at `lifecycle.md` so readers can
judge the likely pace, duration, and review needs of architecture change.

## Before you begin

Confirm the documented system boundary and the authority that accepts its
support state and change horizon. Do not infer lifecycle from repository age,
deployment activity, current implementation, or OKF `status`. If accepted
meaning is unavailable, report semantic profile conformance as `unknown`
instead of creating a placeholder.

## Steps

1. Create `lifecycle.md` using the exact `System Lifecycle` type and common
   fields from the [application profile](../architecture-documentation/software-architecture-application-profile.md#system-lifecycle).
2. State the accepted lifecycle or support state using locally authoritative
   terminology.
3. State the material change horizon and expected evolution: continued active
   development, bounded maintenance, replacement, retirement, or another
   accepted trajectory.
4. Name events that require reassessment, such as a support-state, system
   boundary, operating model, public contract, or replacement-plan change.
   If the trigger imposes an independently maintained obligation on system
   work, admit it as a process Requirement and link it instead of duplicating
   the binding statement here.
5. Link the stable authority for current dates, schedules, or status detail
   rather than copying volatile operational records.
6. Keep ownership, decision policy, assurance, quality requirements, and
   optional architecture concepts with their own semantic owners.

## Final check

- The system—not the document—has an explicit lifecycle or support state.
- Change horizon, expected evolution, and review triggers are consequential
  and accepted.
- Independently maintained process obligations are linked Requirements rather
  than duplicate lifecycle prose.
- OKF `status` is not overloaded as system lifecycle.
- Volatile dates or operational state remain with their authoritative source.
- The concept does not summarize the other profile concepts.

## Related

- [Just Enough Architecture Docs](../architecture-documentation/just-enough-architecture-docs.md)
- [Documenting system ownership](documenting-system-ownership.md)
- [Documenting architecture decision policies](documenting-architecture-decision-policies.md)
- [Documenting system assurance](documenting-system-assurance.md)
