---
type: Guide
title: Documenting needs
description: Use when evidence reveals a solution-independent problem, constraint, opportunity, or desired outcome worth preserving; create one Need concept.
tags: [architecture-documentation, needs, demand, outcomes, authoring]
status: draft
sources:
  - resource: offerings-and-value.md
    title: Offerings and value in software architecture
  - resource: ../profile/gen-stack-application-profile.md#need
    title: Gen Stack application profile — Need
generated: { by: codex/gpt-5.6, at: "2026-08-26T14:02:36Z" }
---

# Documenting needs

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `Need` concept under `intent/needs/` that states a consequential
problem, constraint, opportunity, or desired outcome without prescribing a
response.

## Before you begin

Confirm that the need is accepted, durable, and relevant to architecture. Keep
tentative discovery hypotheses in research and proposed responses in product
or delivery work until they are accepted.

## Representation

Use the OKF envelope and the profile's exact `Need` type and collection.
Present residual body meaning in this preferred order: solution-independent
condition or outcome, affected audiences and circumstances, why it matters,
material exclusions, related concepts, and evidence or visible evidence gaps.
Keep native metadata and links in their owning fields and do not introduce a
feature-request template. This order is authoring guidance, not profile
conformance.

## Steps

1. Name the need as a condition or outcome, not as a requested feature. Replace
   “add a hold button” with the underlying need for a dependable commitment.
2. Create its canonical file using the `Need` type and common fields from the
   [application profile](../profile/gen-stack-application-profile.md#need).
3. Explain the problem, constraint, opportunity, or desired outcome
   independently of any current offering or implementation.
4. Identify the audiences and circumstances for which it matters.
5. State exclusions that distinguish it from goals, Jobs to Be Done, quality
   requirements, and delivery work.
6. Link accepted evidence and related audiences, jobs, offerings, or value
   propositions, then add the concept to `intent/needs/index.md`.

## Final check

- The need remains meaningful if the current solution changes.
- It names why something matters without selecting a feature.
- Its audiences, circumstances, and exclusions are explicit.
- Consequential claims have truthful evidence or a visible evidence gap.

## Related

- [Offerings and value in software architecture](offerings-and-value.md)
- [Documenting Jobs to Be Done](documenting-jobs-to-be-done.md)
