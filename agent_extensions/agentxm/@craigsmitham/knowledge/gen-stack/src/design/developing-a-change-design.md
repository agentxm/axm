---
type: Guide
title: Developing a Change Design
description: Use when one bounded Change needs a proportional technical response; accept an exact Ready Specification, compare only material alternatives, realize Architecture and required Evaluation Protocols, and keep blockers explicit.
tags: [change, change-design, technical-design, alternatives, architecture-realization, evaluation-realization, artifact-lifecycle, open-items, artifact-contract]
status: draft
sources:
  - id: change-design
    resource: change-design.md
    title: Change Design
  - id: changes
    resource: ../work-items/changes.md
    title: Changes
  - id: specification-guide
    resource: ../work-items/writing-change-specifications.md
    title: Writing Change Specifications
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T21:55:00Z
---

# Developing a Change Design

> **Authority:** This Guide applies the [Gen Stack vocabulary and relationship
> model](../glossary.md). Change Design selects a bounded technical response;
> it does not accept desired state, alter durable Architecture silently,
> coordinate delivery, or authorize implementation.

A **Change Design** states how one bounded Change should be realized. It is a
sibling of the Change Specification, not a section owned by it. Use
[Changes](../work-items/changes.md) for coordination and [Writing Change
Specifications](../work-items/writing-change-specifications.md) for why and
what.

## Goal

Produce the smallest complete technical response that resolves consequential
ambiguity, realizes accepted Architecture and required semantic Evaluation
Protocols, exposes tradeoffs and risks, and can be accepted without requiring
implementation to recover hidden choices.

## 1. Bind the Change and exact specification

Identify the Change, exact Change Specification revision, accepted
Requirements, Architecture, ADRs, constraints, invariants, required Protocols,
current realization, authority, and requested design decision.

When the Specification exists, `$design` first verifies that its exact current
revision is persisted `Ready` with no Open items and accepts it in place. A
Draft, stale, concurrently changed, or unverified Specification is not
accepted. Direct design-first entry may produce a Draft but cannot claim a
missing Specification was accepted.

Design-first entry is valid, but its mechanism remains proposed. Recover every
implied outcome, obligation, durable boundary, and Protocol claim and return
those to Change Specification before claiming coherence.

## 2. Scale to consequential ambiguity

Do not manufacture alternatives for a trivial or fully constrained response.
Develop explicit alternatives when choices materially affect responsibility,
state, interfaces, failure behavior, quality, security, compatibility,
reversibility, evidence, cost, or future constraint.

Exploration may remain conversational. Persist the first coherent Design as
Draft in the canonical Change target, and persist later state changes in place.
Use a dedicated repository artifact only when it is the established canonical
target and the work item can link it faithfully.

## 3. Compare material alternatives

For each viable option, describe the same decision-relevant fields: technical
responsibilities, interactions, state and data, failure behavior, constraints,
Architecture fit, evidence cost, migration, reversibility, and risk. Present a
neutral comparison before a recommendation.

Record materially considered exclusions when they affect confidence. If no
evidence supports a recommendation, say so and identify the needed decision or
investigation.

## 4. Specify the technical response

For the recommended or accepted approach, make explicit:

- technical ownership and dependency direction;
- synchronous and asynchronous interactions, ordering, concurrency, and
  idempotency where material;
- interfaces, compatibility, validation, and versioning;
- state ownership, lifecycle, consistency, persistence, and migration;
- failure detection, propagation, containment, recovery, and observability;
- quality, security, privacy, accessibility, and operational behavior;
- rollout, rollback, recovery, and irreversible points; and
- affected Implementation Unit boundaries without turning them into a task
  sequence.

Map each accepted Architecture authority to the technical realization that
preserves it. When the response would change durable meaning, return the delta
to Change Specification or the applicable Architecture authority.

## 5. Realize required Evaluation Protocols

For every required Requirement-satisfaction and Architecture-realization
Protocol, preserve its identity, role, targets, semantic claim, judgment, and
evidence expectations. Define the executable realization:

- Suite, family, or Case mapping;
- seams for controllability and observability;
- data, fixtures, sampling, environments, and configuration;
- execution triggers and incremental feedback points;
- evidence capture, attribution, retention, and traceability;
- handling of failure, inconclusive, skipped, stale, and harness-error states;
  and
- maintenance ownership when the system changes.

Design may propose optional Implementation-conformance Evaluations for local
technical contracts. Keep them separate. A durable or release-critical claim
returns to Change Specification for Requirement or Architecture classification.

## 6. Record state and Open items

Use only `Draft`, `Ready`, or `Accepted`. Put every next-acceptance blocker in
Open items with its authority role and observable resolution condition. Keep
non-blocking technical risks elsewhere.

Design becomes Ready only when it is complete for Plan, reconciles with the
exact Accepted Specification, has no Open items, and authoritative readback
verifies it. `$plan` accepts that exact Ready Design before dependent planning.
Design acceptance does not ratify semantic change or authorize implementation.

## 7. Reconcile with Specification

Compare the finished response with the exact Change Specification revision.
Record one of:

- `conforms` — the Design realizes the specification without changing it;
- `specification revision required` — name every Intent, Requirement,
  Architecture, constraint, or semantic Protocol delta; or
- `blocked` — name the missing authority or evidence.

The canonical Change target establishes coherence from exact artifact
bindings, states, Open items, and reconciliation evidence. No separate
coordination handoff is required.

## Representation

Use a native design format when it can carry the same semantics. In a
Markdown-only host, use this compact fallback. Omit an optional subsection
when no material choice or concern exists.

```markdown
# Change Design: <bounded technical response>

> **Artifact:** <stable Design identity and exact revision>
> **State:** `<Draft | Ready | Accepted>`
> **Canonical:** <work item, native field set, body region, or exact link>
> **Bound to:** <exact Accepted Change Specification identity and revision>

## Summary

<The selected technical response, why it fits, and its most consequential
effect.>

## Open items

- **OI-1 — <blocker>**
  - **Authority:** <responsible role>
  - **Resolves when:** <observable condition>

## Bindings

<Change identity; exact Change Specification revision; accepted Requirements,
Architecture, ADRs, Protocols, constraints, invariants, current realization,
evidence, assumptions, and material forces.>

## Specification reconciliation

- **Status:** <conforms | specification revision required | blocked>
- **Specification:** <exact identity and revision>
- **Semantic deltas:** <None or named deltas and their owning route>

## Decision

<When a real choice exists, use this compact comparison; otherwise state the
fully constrained response and rationale briefly.>

| Option | Benefits | Costs and risks | Disposition |
| --- | --- | --- | --- |

## Technical response

### Responsibilities and interactions

<Ownership, dependencies, calls, messages, events, ordering, and concurrency.>

### Interfaces and state

<Interfaces, compatibility, validation, data, and state transitions.>

### Failure, qualities, and operations

<Failure behavior, quality attributes, security, privacy, accessibility,
observability, and operations.>

## Architecture realization

| Authority | Technical realization | Evidence boundary |
| --- | --- | --- |

## Evaluation realization

| Protocol | Executable realization | Execution and evidence | Failure and maintenance |
| --- | --- | --- | --- |

## Rollout and recovery

<Compatibility windows, state transitions, irreversible points, safeguards,
and recovery.>

## Consequences and residual risks

<Affected Implementation boundaries without sequencing; tradeoffs, residual
risk, operational burden, optional Implementation-conformance Evaluations, and
future constraints.>
```

Omit the options table when there is no real choice, and omit any optional
technical subsection that has no material content. Keep the mapping tables
short; link deep evidence rather than copying it. For `Ready` or `Accepted`,
write `- None.` under Open items.

## Completion criteria

- The Design is bound to one Change and one exact Change Specification
  revision.
- Detail is proportional to consequential ambiguity.
- Alternatives are comparable and precede the recommendation when a real
  choice exists.
- Accepted Architecture and every required Protocol have concrete technical
  realization.
- Optional Implementation-conformance Evaluations remain separate.
- State, risks, and Open items are clear.
- Ready and Accepted contain `- None.` under Open items.
- Specification reconciliation is explicit.
- No implementation plan, delivery coordination, code mutation, or semantic
  acceptance is implied.
