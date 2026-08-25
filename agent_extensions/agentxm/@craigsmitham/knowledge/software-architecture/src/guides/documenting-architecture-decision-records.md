---
type: Guide
title: Documenting architecture decision records
description: How to record one accepted architecture decision with context, rationale, alternatives, consequences, and supersession or reconsideration conditions.
tags: [architecture-documentation, architecture-decisions, adr, rationale, consequences, authoring]
status: draft
sources:
  - resource: ../architecture-documentation/software-architecture-application-profile.md#architecture-decision-record
    title: Software architecture docs application profile — Architecture Decision Record
  - resource: documenting-architecture-decision-policies.md
    title: Documenting architecture decision policies
generated: { by: codex/gpt-5.6, at: 2026-08-23T02:10:17Z }
---

# Documenting architecture decision records

## Goal

Create one `Architecture Decision Record` under `decisions/` for an accepted,
durable choice whose rationale and consequences need an independent lifecycle.

## Before you begin

Confirm that the applicable `decisions.md` policy requires a record and that
the named authority has accepted the choice. Keep an unaccepted option,
investigation, or proposal in its existing lifecycle; do not write an ADR in
order to make a decision appear complete.

## Steps

1. Give the decision a stable outcome-oriented name and create
   `decisions/<decision>.md` using the exact `Architecture Decision Record`
   type and common fields from the [application profile](../architecture-documentation/software-architecture-application-profile.md#architecture-decision-record).
2. If this is the first record, create a navigational `decisions/index.md` and
   link the collection from the architecture root. Preserve `decisions.md` as
   the policy.
3. State the context and forces that made the choice consequential.
4. State the accepted choice and the authority or event that accepted it.
5. Record the rationale and material alternatives only to the extent needed to
   preserve why this option was chosen.
6. State positive and negative consequences, including constraints imposed on
   later change and affected concepts.
7. State the assumptions, events, or evidence that require reconsideration or
   supersession.
8. When superseded, retain the record, link its replacement, and keep it
   reachable. Do not use OKF `status` as the semantic decision status.

## Final check

- The record represents one accepted decision, not a proposal or discussion.
- Context, choice, rationale, consequences, and reconsideration are present.
- The named path is stable and `decisions/index.md` remains navigational.
- `decisions.md` still owns policy rather than serving as an ADR catch-all.
- Superseded records remain reachable and point to their replacements.

## Related

- [Documenting architecture decision policies](documenting-architecture-decision-policies.md)
- [Documenting architecture constraints](documenting-architecture-constraints.md)
- [Documenting product quality requirements](documenting-product-quality-requirements.md)
- [Organizing an architecture docs corpus](organizing-an-architecture-docs-corpus.md)
