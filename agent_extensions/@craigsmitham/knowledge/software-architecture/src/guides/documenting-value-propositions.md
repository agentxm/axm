---
type: Guide
title: Documenting value propositions
description: How to create one Value Proposition concept that scopes an evidence-bearing promise to an offering and audience.
tags: [architecture-documentation, value-propositions, offerings, audiences, evidence, authoring]
status: draft
sources:
  - resource: ../foundations/offerings-and-value.md
    title: Offerings and value in software architecture
  - resource: ../architecture-documentation/software-architecture-application-profile.md#value-proposition
    title: Software architecture docs application profile — Value Proposition
generated: { by: codex/gpt-5.6, at: 2026-08-21T21:13:34Z }
---

# Documenting value propositions

## Goal

Create one `Value Proposition` concept under `value/value-propositions/` that
states why a particular audience should expect an offering to address a need
or job.

## Before you begin

Confirm the offering, audience, promised benefit, and authority for the claim.
Do not promote campaign language, roadmap intent, current pricing, or an
unmeasured outcome into accepted architecture meaning.

## Steps

1. Name the proposition for the benefit and audience it distinguishes, not for
   an internal slogan.
2. Create its canonical file using the `Value Proposition` type and common
   fields from the [application profile](../architecture-documentation/software-architecture-application-profile.md#value-proposition).
3. Identify the offering and audience to which the promise applies.
4. Explain the needs or jobs addressed, the promised benefit, and how the
   audience would recognize that value.
5. State scope, exclusions, limitations, and dependencies that keep the claim
   honest. Add `stale_after` when a known absolute review boundary applies.
6. Link the authority or evidence for material claims and related concepts,
   then update `value/value-propositions/index.md`.

## Final check

- The proposition is scoped to one offering-and-audience context.
- The benefit is a promise, not a claim that an outcome already occurred.
- Limitations and time-sensitive assumptions are explicit.
- Channel-specific copy and live commercial facts remain elsewhere.

## Related

- [Offerings and value in software architecture](../foundations/offerings-and-value.md)
- [Documenting offerings](documenting-offerings.md)
