---
type: Reference
title: Change template
description: Provides a compact, tracker-neutral body fallback for a bounded Change without prescribing a delivery method or separate specification and design stages.
tags: [change, change-request, template, markdown, acceptance-criteria, verification]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Change template

Use native host fields for identity, type, classification, status, priority,
assignment, relationships, milestones, and timestamps when their semantics
match. Omit inapplicable headings.

```markdown
# <Verb> <bounded outcome>

## Summary

<Why this Change exists, the intended outcome, and its current decision or
delivery boundary.>

## Motivation and sources

- **Motivation:** <problem, opportunity, obligation, or authorized objective>
- **Sources:** <requests, Defect Reports, incidents, specifications, decisions,
  observations, or other stable evidence>

## Scope

- **In scope:** <included outcomes, behavior, systems, data, users, and
  conditions>
- **Out of scope:** <material exclusions and non-goals>
- **Affected authorities:** <links to specifications, contracts, requirements,
  policies, or decisions without copying their normative content>

## Constraints and response context

- **Constraints and invariants:** <compatibility, data, security, privacy,
  accessibility, operational, legal, or other applicable limits>
- **Technical context:** <findings, alternatives, selected approach, design or
  implementation notes, and their decision state when supplied>
- **Delivery considerations:** <dependencies, migration, rollout, rollback,
  communication, or operational readiness when material>

## Completion and verification

- **Acceptance conditions:** <observable conditions for the intended outcome>
- **Verification strategy:** <how evidence will be gathered, with relevant
  revision, environment, inputs, and observation window>
- **Verification result:** <bounded evidence and outcome, when available>

## Coordination

- **Classification:** <local purpose classification and rationale when needed>
- **Relationships:** <sources, dependencies, related work, or items remediated>
- **Risks and open questions:** <uncertainty, residual risk, and undecided
  choices>
- **Next action:** <owner, deciding authority when different, next authorized
  action, and blocker or review trigger>
```
