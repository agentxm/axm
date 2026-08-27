---
type: Guide
title: Documenting architecture decision records
description: Use when an accepted architecture choice has durable consequences or needs later reconsideration; record one decision with context, rationale, alternatives, consequences, and supersession conditions.
tags: [architecture-documentation, architecture-decisions, adr, rationale, consequences, authoring]
status: draft
sources:
  - resource: /profile/gen-stack-application-profile.md#architecture-decision-record
    title: Gen Stack application profile — Architecture Decision Record
  - resource: /governance/documenting-architecture-decision-policies.md
    title: Documenting architecture decision policies
generated: { by: codex/gpt-5.6, at: "2026-08-26T20:18:00Z" }
---

# Documenting architecture decision records

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `Architecture Decision Record` under `architecture/decisions/` for an accepted,
durable choice whose rationale and consequences need an independent lifecycle.

## Before you begin

Confirm that the applicable `decisions.md` policy requires a record and that
the named authority has accepted the choice. Keep an unaccepted option,
investigation, or proposal in its existing lifecycle; do not write an ADR in
order to make a decision appear complete.

## Representation

Use the OKF envelope, the profile's exact `Architecture Decision Record` type
and collection, and controlled relationships in their native roles. Present
residual body meaning in this preferred order: decision context, accepted
choice, rationale, material alternatives, consequences, and supersession or
reconsideration conditions. Keep document status and provenance in OKF
frontmatter and do not use an ADR body to duplicate linked Requirements. This
order is authoring guidance, not profile conformance.

## Steps

1. Give the decision a stable outcome-oriented name and create
   `architecture/decisions/<decision>.md` using the exact `Architecture Decision Record`
   type and common fields from the [application profile](/profile/gen-stack-application-profile.md#architecture-decision-record).
2. If this is the first record, create a navigational `architecture/decisions/index.md` and
   link the collection from the corpus root. Preserve `decisions.md` as
   the policy.
3. State the context and forces that made the choice consequential.
4. State the accepted choice and the authority or event that accepted it.
5. Record the rationale and material alternatives only to the extent needed to
   preserve why this option was chosen.
6. State positive and negative consequences and affected concepts. Distinguish
   the chosen response from an independently binding limitation: when the
   decision creates such a limitation, admit a constraint Requirement with the
   ADR as a `requirement_sources` authority instead of leaving the obligation
   only in the consequences.
7. Record each Requirement the choice responds to under
   `relationships.responds-to-requirement`, then run
   run `scripts/sync-gen-stack-relationships.py` from the repository root to materialize
   `is-addressed-by-adr` on those Requirements.
8. State the assumptions, events, or evidence that require reconsideration or
   supersession.
9. When superseded, retain the record, link its replacement, and keep it
   reachable. Do not use OKF `status` as the semantic decision status.

## Final check

- The record represents one accepted decision, not a proposal or discussion.
- Context, choice, rationale, consequences, and reconsideration are present.
- The named path is stable and `architecture/decisions/index.md` remains navigational.
- `decisions.md` still owns policy rather than serving as an ADR catch-all.
- Superseded records remain reachable and point to their replacements.
- Any independently binding limitation produced by the decision has one
  constraint Requirement authority; the ADR continues to own the choice and
  rationale.
- Relationship synchronization reports no changes.

## Related

- [Documenting architecture decision policies](/governance/documenting-architecture-decision-policies.md)
- [Documenting architecture constraints](/architecture/requirements/documenting-architecture-constraints.md)
- [Documenting product quality requirements](/architecture/requirements/documenting-product-quality-requirements.md)
- [Gen Stack application profile for OKF v0.2](/profile/gen-stack-application-profile.md)
