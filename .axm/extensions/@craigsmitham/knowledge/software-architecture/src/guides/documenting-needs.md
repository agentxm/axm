---
type: Guide
title: Documenting needs
description: How to create one Need concept that preserves a solution-independent problem, constraint, opportunity, or desired outcome.
tags: [architecture-documentation, needs, demand, outcomes, authoring]
status: draft
sources:
  - resource: ../foundations/offerings-and-value.md
    title: Offerings and value in software architecture
  - resource: ../architecture-documentation/software-architecture-application-profile.md#need
    title: Software architecture docs application profile — Need
generated: { by: codex/gpt-5.6, at: 2026-08-21T21:13:34Z }
---

# Documenting needs

## Goal

Create one `Need` concept under `value/needs/` that states a consequential
problem, constraint, opportunity, or desired outcome without prescribing a
response.

## Before you begin

Confirm that the need is accepted, durable, and relevant to architecture. Keep
tentative discovery hypotheses in research and proposed responses in product
or delivery work until they are accepted.

## Steps

1. Name the need as a condition or outcome, not as a requested feature. Replace
   “add a hold button” with the underlying need for a dependable commitment.
2. Create its canonical file using the `Need` type and common fields from the
   [application profile](../architecture-documentation/software-architecture-application-profile.md#need).
3. Explain the problem, constraint, opportunity, or desired outcome
   independently of any current offering or implementation.
4. Identify the audiences and circumstances for which it matters.
5. State exclusions that distinguish it from goals, Jobs to Be Done, quality
   requirements, and delivery work.
6. Link accepted evidence and related audiences, jobs, offerings, or value
   propositions, then add the concept to `value/needs/index.md`.

## Final check

- The need remains meaningful if the current solution changes.
- It names why something matters without selecting a feature.
- Its audiences, circumstances, and exclusions are explicit.
- Consequential claims have truthful evidence or a visible evidence gap.

## Related

- [Offerings and value in software architecture](../foundations/offerings-and-value.md)
- [Documenting Jobs to Be Done](documenting-jobs-to-be-done.md)
