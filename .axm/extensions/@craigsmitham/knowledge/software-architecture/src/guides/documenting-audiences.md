---
type: Guide
title: Documenting audiences
description: How to create one Audience concept for a durable, evidence-supported group without publishing private people, accounts, or research personas.
tags: [architecture-documentation, audiences, evidence, public-safety, authoring]
status: draft
sources:
  - resource: ../foundations/offerings-and-value.md
    title: Offerings and value in software architecture
  - resource: ../foundations/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - resource: ../architecture-documentation/software-architecture-application-profile.md#audience
    title: Software architecture docs application profile — Audience
generated: { by: codex/gpt-5.6, at: 2026-08-21T22:12:04Z }
---

# Documenting audiences

## Goal

Create one `Audience` concept under `value/audiences/` for a durable group to
whom an offering, need, value claim, or interaction is consequential.

## Before you begin

Use accepted, public-safe evidence. Do not turn a named person, customer
account, interview participant, or speculative persona into an architecture
concept. A role such as operator or purchaser is contextual and need not define
one permanent audience classification. Likewise, an actor is a role relative
to one use case and subject; an automated external system can be an actor
without becoming an Audience.

## Steps

1. Name the group using stable language that distinguishes it from neighboring
   audiences without encoding a temporary campaign or research segment.
2. Create its canonical file using the `Audience` type and common fields from
   the [application profile](../architecture-documentation/software-architecture-application-profile.md#audience).
3. Describe the circumstances or concerns that make this group architecturally
   relevant. Avoid reducing it to demographics or access-control roles.
4. State the roles the audience plays only in the relevant offering or
   interaction contexts. When it plays a primary or supporting actor role,
   identify the specific use case rather than making Actor a global audience
   classification.
5. Record material exclusions and link the evidence supporting consequential
   segmentation, need, or behavior claims. Keep raw research in its own
   authority.
6. Link related offerings, needs, jobs, propositions, use cases, features, or
   surfaces in prose, then add the concept to `value/audiences/index.md`.

## Final check

- The audience is a durable group rather than a private or named subject.
- Circumstances and relevance are clearer than demographics alone.
- Contextual roles have not become a global taxonomy.
- Audience and actor role remain distinct; external systems are not audiences.
- Evidence and its limitations are visible for material claims.

## Related

- [Offerings and value in software architecture](../foundations/offerings-and-value.md)
- [Goal-oriented behavior and use cases](../foundations/goal-oriented-behavior.md)
- [Documenting Jobs to Be Done](documenting-jobs-to-be-done.md)
