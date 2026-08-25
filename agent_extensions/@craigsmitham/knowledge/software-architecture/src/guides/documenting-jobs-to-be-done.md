---
type: Guide
title: Documenting Jobs to Be Done
description: How to create one Job to Be Done concept grounded in evidence about progress sought in particular circumstances.
tags: [architecture-documentation, jobs-to-be-done, jtbd, demand, evidence, authoring]
status: draft
sources:
  - resource: ../foundations/jobs-to-be-done.md
    title: Jobs to Be Done
  - resource: ../architecture-documentation/software-architecture-application-profile.md#job-to-be-done
    title: Software architecture docs application profile — Job to Be Done
generated: { by: codex/gpt-5.6, at: 2026-08-21T21:13:34Z }
---

# Documenting Jobs to Be Done

## Goal

Create one `Job to Be Done` concept under `value/jobs/` that explains progress
an audience seeks in particular circumstances.

## Before you begin

Start from accepted evidence about actual choices, constraints, alternatives,
or struggling moments. A plausible sentence is not evidence. Keep interview
records, named participants, tentative segmentation, and opportunity scoring
in their research authority.

## Steps

1. Identify the audience and circumstances in which demand arises. Circumstance
   should explain more than a demographic or permanent persona attribute.
2. State the sought progress without naming a preferred product, feature,
   surface, or implementation.
3. Create the canonical file using the `Job to Be Done` type and common fields
   from the [application profile](../architecture-documentation/software-architecture-application-profile.md#job-to-be-done).
4. Explain relevant functional, social, or emotional forces. Include only
   dimensions supported by evidence; do not create empty classifications.
5. State exclusions that distinguish the job from neighboring needs, jobs,
   use cases, and capabilities.
6. Link the evidence and consequential relationships to audiences, offerings,
   propositions, use cases, and capabilities, then update `value/jobs/index.md`.

## Final check

- The statement combines circumstances with sought progress.
- It remains valid if the current response changes.
- It is not a feature request, use-case flow, or provider capability.
- Evidence, confidence, and material exclusions are honest and visible.

## Related

- [Jobs to Be Done](../foundations/jobs-to-be-done.md)
- [Documenting needs](documenting-needs.md)
- [Documenting use cases](documenting-use-cases.md)
