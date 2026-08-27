---
type: Guide
title: Documenting value propositions
description: Use when an evidence-bearing promise must be scoped to one Offering and Audience; create one Value Proposition concept.
tags: [architecture-documentation, value-propositions, offerings, audiences, evidence, authoring]
status: draft
sources:
  - resource: offerings-and-value.md
    title: Offerings and value in software architecture
  - resource: ../profile/gen-stack-application-profile.md#value-proposition
    title: Gen Stack application profile — Value Proposition
generated: { by: codex/gpt-5.6, at: "2026-08-26T14:02:36Z" }
---

# Documenting value propositions

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `Value Proposition` concept under `intent/value-propositions/` that
states why a particular audience should expect an offering to address a need
or job.

## Before you begin

Confirm the offering, audience, promised benefit, and authority for the claim.
Do not promote campaign language, roadmap intent, current pricing, or an
unmeasured outcome into accepted architecture meaning.

## Representation

Use the OKF envelope and the profile's exact `Value Proposition` type and
collection. Present residual body meaning in this preferred order: offering
and audience, addressed Need or Job, promised benefit, how value is recognized,
scope and limitations, dependencies, and evidence. Use native `stale_after`
when applicable and do not repeat it or other OKF metadata in the body. This
order is authoring guidance, not profile conformance.

## Steps

1. Name the proposition for the benefit and audience it distinguishes, not for
   an internal slogan.
2. Create its canonical file using the `Value Proposition` type and common
   fields from the [application profile](../profile/gen-stack-application-profile.md#value-proposition).
3. Identify the offering and audience to which the promise applies.
4. Explain the needs or jobs addressed, the promised benefit, and how the
   audience would recognize that value.
5. State scope, exclusions, limitations, and dependencies that keep the claim
   honest. Add `stale_after` when a known absolute review boundary applies.
6. Link the authority or evidence for material claims and related concepts,
   then update `intent/value-propositions/index.md`.

## Final check

- The proposition is scoped to one offering-and-audience context.
- The benefit is a promise, not a claim that an outcome already occurred.
- Limitations and time-sensitive assumptions are explicit.
- Channel-specific copy and live commercial facts remain elsewhere.

## Related

- [Offerings and value in software architecture](offerings-and-value.md)
- [Documenting offerings](documenting-offerings.md)
