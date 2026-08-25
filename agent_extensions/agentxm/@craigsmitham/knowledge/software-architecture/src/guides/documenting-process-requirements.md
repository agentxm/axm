---
type: Guide
title: Documenting process requirements
description: How to document one durable obligation on system lifecycle, development, operation, or governance without turning plans, tasks, or corpus rules into system requirements.
tags: [architecture-documentation, requirements, process-requirements, lifecycle, governance, assurance]
status: draft
sources:
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
  - id: requirement-classification
    resource: ../foundations/requirement-classification.md
    title: Classifying requirements in software architecture
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 — Requirements engineering
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:47:49Z
---

# Documenting process requirements

Use this guide when the accepted obligation is on how the documented system is
developed, changed, released, operated, reviewed, assured, or governed, and the
obligation is durable enough to maintain beside an architecture subject.

## 1. Confirm the profile boundary

ISO/IEC/IEEE 29148 commonly places project process requirements in acquisition
or statement-of-work material.[^iso-29148] This profile admits a narrower
architecture set. Create a `process` Requirement only when the obligation:

- applies to work on or operation of the documented system;
- has an accepted source such as policy, regulation, contract, assurance need,
  or higher-level requirement;
- remains meaningful across ordinary task and team changes;
- can be evaluated independently; and
- materially affects architecture lifecycle, ownership, decision-making,
  assurance, delivery, or operation.

Keep a one-time task, sprint plan, runbook step, current approval queue, team
habit, or documentation-profile rule with its delivery, operational, or corpus
authority.

## 2. Identify the governed outcome

Follow [Documenting requirements](documenting-requirements.md). Name:

- the eligible architecture subject whose work is governed;
- the triggering change, release, event, interval, or condition;
- the review, approval, production, retention, exercise, or other outcome;
- the applicable role or authority without copying a volatile person roster;
  and
- the record or observable result needed to tell whether the obligation was
  met.

Set `requirement_type: process`. Colocate it beneath the subject, even when a
root lifecycle, ownership, decision-policy, or assurance concept links it.
Those kernel concepts explain governance and authority; the Requirement alone
owns the binding obligation.

## 3. Draft the obligation, not the procedure

> When `[governed trigger]`, `[subject or its governed process]` shall
> `[required process outcome]` `[within accepted bounds]`.

State the necessary outcome. Leave step order, tool commands, ticket fields,
meeting mechanics, and current workflow implementation with a procedure or
automation authority unless a particular mechanism is itself binding.

Distinguish process from delivered behavior. “Every privileged release shall
receive independent approval” is process. “The deployment service shall reject
a release without a valid approval record” is functional. Both may be needed,
but one does not substitute for the other.

## 4. Review durability and evidence

Ask whether:

- the source truly binds the process rather than expressing a preference;
- the obligation survives ordinary workflow and tooling changes;
- the trigger, outcome, accountable authority, and exception boundary are
  unambiguous;
- the requirement governs the system's work rather than the architecture
  corpus's own conformance;
- a procedure or automation rule can evolve without silently changing desired
  state; and
- evidence can show that the outcome occurred without being copied into the
  Requirement.

## Example

Weak:

> Engineers shall follow the security process.

Synthetic process Requirement:

> Before a change that alters the authorization boundary is released, the
> Access system change process shall obtain approval from a role independent
> of the change author and retain the approval with the release record.

The security-review method and tool remain external. If independent approval
is mandated by regulation, link that authority in `requirement_sources`.

[^iso-29148]: ISO/IEC/IEEE 29148:2018 supplies the broader process-requirement
    context adapted to this profile's durable system-work boundary.
