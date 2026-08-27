---
type: Guide
title: Documenting system lifecycle
description: Use when a system needs an accepted support state, change horizon, expected evolution, and event-driven review conditions; create the required System Lifecycle concept.
tags: [architecture-documentation, system-lifecycle, support, change-horizon, authoring]
status: draft
sources:
  - resource: /profile/gen-stack-application-profile.md#system-lifecycle
    title: Gen Stack application profile — System Lifecycle
generated: { by: codex/gpt-5.6, at: "2026-08-26T15:10:00Z" }
---

# Documenting system lifecycle

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create the required `System Lifecycle` concept at `lifecycle.md` so readers can
judge the likely pace, duration, and review needs of architecture change.

## Before you begin

Confirm the documented system boundary and the authority that accepts its
support state and change horizon. Do not infer lifecycle from repository age,
deployment activity, current implementation, or OKF `status`. If accepted
meaning is unavailable, report semantic profile conformance as `unknown`
instead of creating a placeholder.

## Representation

Use the OKF envelope and the profile's exact `System Lifecycle` type and root
path. Present residual body meaning in this preferred order: accepted support
or lifecycle state, material change horizon, expected evolution, reassessment
triggers, and links to volatile schedule or status authorities. Do not copy
OKF document status, dates owned elsewhere, or linked process obligations into
parallel body metadata. This order is authoring guidance, not profile
conformance.

## Steps

1. Create `lifecycle.md` using the exact `System Lifecycle` type and common
   fields from the [application profile](/profile/gen-stack-application-profile.md#system-lifecycle).
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

- [Gen Stack application profile for OKF v0.2](/profile/gen-stack-application-profile.md)
- [Gen Stack vocabulary and relationship model](/glossary.md)
- [Documenting system ownership](documenting-system-ownership.md)
- [Documenting architecture decision policies](documenting-architecture-decision-policies.md)
- [Documenting system assurance](documenting-system-assurance.md)
