---
type: Guide
title: Developing a Change Design
description: Use when one bounded Change needs a proportional technical response; compare material alternatives, realize accepted Architecture and required Evaluation Protocols, and reconcile the exact Change Specification without taking over specification or delivery coordination.
tags: [change, change-design, technical-design, alternatives, architecture-realization, evaluation-realization, artifact-contract]
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

Design-first entry is valid, but its mechanism remains proposed. Recover every
implied outcome, obligation, durable boundary, and Protocol claim and return
those to Change Specification before claiming coherence.

## 2. Scale to consequential ambiguity

Do not manufacture alternatives for a trivial or fully constrained response.
Develop explicit alternatives when choices materially affect responsibility,
state, interfaces, failure behavior, quality, security, compatibility,
reversibility, evidence, cost, or future constraint.

The design may remain conversational when it is immediate and recoverable. Use
a work-item section when it must survive handoff. Use a dedicated repository
artifact only when the response evolves independently and has an established
owner and lifecycle.

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

## 6. Record maturity and acceptance

Use an explicit design state such as exploring, recommended, proposed,
accepted, rejected, or superseded. Name the authority for acceptance and the
exact decision requested. Acceptance of Design does not ratify semantic change
or authorize implementation.

Record unresolved technical decisions, evidence needed, owner, and which later
action each one blocks.

## 7. Reconcile with Specification

Compare the finished response with the exact Change Specification revision.
Record one of:

- `conforms` — the Design realizes the specification without changing it;
- `specification revision required` — name every Intent, Requirement,
  Architecture, constraint, or semantic Protocol delta; or
- `blocked` — name the missing authority or evidence.

The Change coordination record establishes coherence only after it binds the
exact ratified specification and accepted design revisions and the
reconciliation evidence supports agreement.

## Representation

Use a native design format when it can carry the same semantics. In a
Markdown-only host or conversation, use this exact fallback. Keep every
top-level heading and write `Not applicable` where justified.

```markdown
# Change Design: <bounded technical response>

## Design status and acceptance request
<Exploring | recommended | proposed | accepted | rejected | superseded; exact
decision requested and authority.>

## Change and specification binding
<Change identity; exact Change Specification revision; accepted Requirements,
Architecture, ADRs, Protocols, constraints, invariants, and non-goals.>

## Context and forces
<Current realization, evidence, assumptions, decision criteria, and material
technical ambiguity.>

## Alternatives
<Viable options in parallel form and materially considered exclusions.>

## Comparison
<Decision-relevant comparison before any recommendation.>

## Recommended or accepted technical approach
<Selected response, rationale, maturity, and remaining uncertainty.>

## Responsibilities and interactions
<Technical ownership, dependencies, calls, messages, events, ordering, and
concurrency.>

## Interfaces, state, and data
<Contracts, compatibility, validation, ownership, lifecycle, consistency,
persistence, and migration.>

## Failure and quality behavior
<Failure handling, recovery, observability, security, privacy, accessibility,
performance, and operational behavior.>

## Architecture realization
<Mapping from each accepted Architecture authority to technical realization.>

## Evaluation realization
<Required Protocol mapping; seams; data and environments; execution and
evidence; failure and inconclusive handling; traceability and maintenance.>

## Implementation-conformance Evaluations (optional)
<Separate local technical claims, or Not applicable.>

## Migration, rollout, rollback, and recovery
<Compatibility windows, state transitions, irreversible points, safeguards,
and recovery.>

## Implementation boundaries
<Affected units and seams, without implementation sequencing.>

## Consequences and risks
<Tradeoffs, residual risk, operational burden, and future constraints.>

## Unresolved technical decisions
<Question, evidence or authority needed, owner, and blocked action.>

## Specification reconciliation
<Conforms | specification revision required | blocked; exact revision and
named semantic deltas.>
```

## Completion criteria

- The Design is bound to one Change and one exact Change Specification
  revision.
- Detail is proportional to consequential ambiguity.
- Alternatives are comparable and precede the recommendation when a real
  choice exists.
- Accepted Architecture and every required Protocol have concrete technical
  realization.
- Optional Implementation-conformance Evaluations remain separate.
- Maturity, acceptance authority, risks, and unresolved decisions are clear.
- Specification reconciliation is explicit.
- No implementation plan, delivery coordination, code mutation, or semantic
  acceptance is implied.
