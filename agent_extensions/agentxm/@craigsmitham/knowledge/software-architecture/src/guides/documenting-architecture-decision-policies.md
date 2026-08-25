---
type: Guide
title: Documenting architecture decision policies
description: How to create the required Architecture Decision Policy concept governing ADR thresholds, authority, content, location, supersession, and reconsideration.
tags: [architecture-documentation, architecture-decisions, decision-policy, adr, authoring]
status: draft
sources:
  - resource: ../architecture-documentation/software-architecture-application-profile.md#architecture-decision-policy
    title: Software architecture docs application profile — Architecture Decision Policy
  - resource: ../architecture-documentation/just-enough-architecture-docs.md
    title: Just Enough Architecture Docs
generated: { by: codex/gpt-5.6, at: 2026-08-25T19:19:59Z }
---

# Documenting architecture decision policies

## Goal

Create the required `Architecture Decision Policy` concept at `decisions.md`
without turning the policy into an inventory of decisions.

## Before you begin

Confirm the accepted decision and review authority. Distinguish a policy for
recording accepted choices from proposals, design discussions, delivery work,
and the records themselves. A policy is required even when no local ADR is
currently justified.

## Steps

1. Create `decisions.md` using the exact `Architecture Decision Policy` type
   and common fields from the [application profile](../architecture-documentation/software-architecture-application-profile.md#architecture-decision-policy).
2. Define the threshold that makes a choice ADR-worthy: durable consequences,
   meaningful alternatives, difficult-to-recover rationale, or another
   accepted architecture-significance test.
3. Name who or what authority accepts, supersedes, and may reopen an
   architecture decision.
4. State that accepted local records live at `decisions/<decision>.md` and
   define their minimum content.
5. Name events that require reconsideration, such as invalidated assumptions,
   changed constraints, unmet quality outcomes, or material system change.
6. If no local ADRs are justified, state the bounded rationale, alternative
   decision authority, consequence, and trigger that would require records.
7. Create no `decisions/` directory until the first accepted ADR is admitted.
8. Keep corpus-governance mechanics in the policy. When a rule creates an
   independently maintained obligation on system development, operation, or
   governance, admit a process Requirement and link it instead of maintaining
   a second binding statement here.

## Final check

- The policy defines threshold, authority, location, minimum content, and
  reconsideration.
- `decisions.md` contains policy rather than several decision records.
- A no-local-ADR conclusion is justified and has a reassessment trigger.
- Proposals and unresolved choices remain outside the ADR collection.
- Linked process Requirements, when present, own system-work obligations;
  `decisions.md` continues to own the corpus decision policy.
- The conditional `decisions/` directory exists only when it contains an
  accepted named record.

## Related

- [Documenting architecture decision records](documenting-architecture-decision-records.md)
- [Documenting architecture constraints](documenting-architecture-constraints.md)
- [Documenting system ownership](documenting-system-ownership.md)
- [Documenting system assurance](documenting-system-assurance.md)
