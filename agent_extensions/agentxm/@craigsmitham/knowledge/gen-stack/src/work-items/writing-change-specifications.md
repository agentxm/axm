---
type: Guide
title: Writing Change Specifications
description: Use when one bounded Change needs a human-ratifiable account of why and what must change; specify exact Intent, Requirement, Architecture, constraint, and semantic Evaluation Protocol changes without selecting the technical response or coordinating delivery.
tags: [change, change-specification, intent, requirements, architecture, evaluation-protocols, ratification, artifact-contract]
status: draft
sources:
  - id: changes
    resource: changes.md
    title: Changes
  - id: change-design-guide
    resource: ../design/developing-a-change-design.md
    title: Developing a Change Design
  - id: requirement-impact
    resource: ../control-loop/analyzing-requirement-impact.md
    title: Analyzing Requirement impact
  - id: requirement-change-guide
    resource: specifying-requirement-changes.md
    title: Specifying Requirement changes in software work items
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T21:55:00Z
---

# Writing Change Specifications

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](../glossary.md). When it proposes
> governed corpus changes, the [Gen Stack application
> profile](../profile/gen-stack-application-profile.md) owns their
> representation. The Guide adds no semantic or delivery authority.

A **Change Specification** states why and what must change for one bounded
Change. It does not own the Change's coordination state and does not select the
technical response. Use [Changes](changes.md) for coordination and [Developing
a Change Design](../design/developing-a-change-design.md) for how.

When the Change remediates an established Defect, also apply [Addressing
defects through Changes](addressing-defects-through-changes.md). The artifact
remains a Change Specification and uses the same contract.

## Goal

Produce a human-ratifiable specification in which the intended outcome, scope,
affected desired state, complete Architecture meaning, constraints, and
required semantic evidence are explicit enough that Design need not invent
them.

## Boundary

Specification owns:

- source context and intended outcome;
- scope, boundaries, and non-goals;
- Intent impact;
- exact Requirement and Architecture dispositions;
- semantic Requirement-satisfaction and Architecture-realization Evaluation
  Protocol changes;
- constraints, invariants, risks, and unresolved meaning; and
- ratification state and request.

It does not own technical alternatives, implementation structure, executable
test realization, Implementation-conformance Evaluations, delivery state,
overall Change coherence, or the next delivery action.

## 1. Bind one Change

Identify the Change and its current classification, source links, authority,
and requested specification decision. If the request is still unbounded, keep
it as a Signal or shape a Pitch. Do not create multiple Changes merely because
several source records or Defects are involved.

Use exact native fields where available. Keep the body focused on semantic
content the host cannot represent faithfully.

## 2. Preserve sources without upgrading them

Link material Signals, Observations, Pitches, Defect Reports, incidents,
research, investigation, and existing authorities. Distinguish reported,
observed, inferred, proposed, accepted, rejected, and unknown claims.

A Pitch remains provisional. Current Implementation and tests are evidence of
what exists, not automatic desired state. Preserve unavailable or restricted
evidence as an explicit limitation.

## 3. State the problem, outcome, and boundary

Describe the current condition, the human or system consequence, and the
observable intended outcome without prescribing a mechanism. Name affected
actors, behavior, data, interfaces, environments, and time horizon only as far
as they determine the change.

State material exclusions and non-goals. Separate a coherent mixed Change from
unrelated cleanup. If scope needs independent acceptance, rollout, evidence,
or recovery, split it at the Change boundary.

## 4. Analyze Intent and Requirement impact

Apply [Analyzing Requirement
impact](../control-loop/analyzing-requirement-impact.md). For every affected
Requirement, use one explicit disposition: unchanged, add, revise, retire,
replace, split, merge, or blocked. Link canonical identities and distinguish
accepted meaning from candidate change.

When an actual Requirement delta exists, apply [Specifying Requirement
changes](specifying-requirement-changes.md). A Change that only restores
satisfaction of unchanged meaning should not fabricate a Requirement change.

## 5. Specify complete Architecture meaning

Disposition every affected Architecture authority with the same explicit
lifecycle vocabulary. For each change, state enough before-and-after meaning
to ratify:

- responsibilities and boundaries;
- interfaces and interactions;
- data and state;
- quality and operational consequences;
- applicable decisions or ADRs;
- views that must explain the accepted structure; and
- relevant unchanged Architecture.

An unresolved architecture-significant choice is a blocker. Do not delegate it
silently to Design or implementation.

## 6. Specify semantic Evaluation Protocol changes

For every in-scope Requirement and Architecture authority, identify the
applicable Requirement-satisfaction or Architecture-realization Protocol as
unchanged, added, revised, retired, replaced, split, merged, or blocked. Record:

- exact or stable provisional Protocol identity;
- role and exact targets;
- bounded semantic claim and material coverage conditions;
- pass, fail, and inconclusive judgment semantics;
- required evidence characteristics and traceability; and
- lifecycle, maturity, authority, and blockers.

Describe what must be assessable, not how to implement the assessment. Do not
prescribe Suites, test files, fixtures, tools, commands, environments,
instrumentation, or Implementation-conformance Evaluations.

A missing required semantic Protocol can remain visible in an exploratory
draft. It blocks ratification, Change coherence, and dependent planning.

## 7. Record constraints, risks, and authority

Record only material legal, policy, compatibility, accessibility, performance,
security, privacy, safety, operational, migration, rollout, rollback, and
recovery constraints. Preserve invariants that an acceptable Design must
conserve.

List unresolved meaning, the evidence or decision that would resolve it, its
owner, and which action it blocks. State the authority that may ratify each
candidate semantic change. Specification status never substitutes for that
authority.

## 8. Reconcile with Design without absorbing it

When a Change Design exists, compare its implications with the exact Change
Specification revision. Return any changed outcome, obligation, durable
boundary, Architecture decision, or semantic Protocol claim to its owner.

Record the resulting specification revision and ratification state here. The
Design records its own acceptance state and reconciliation result; the Change
coordination record decides whether the exact pair is coherent.

## Representation

Native host fields may satisfy this semantic contract. In a Markdown-only host
or conversation, use this exact fallback. Keep every top-level heading and use
`Not applicable` where the bounded Change genuinely has no content.

```markdown
# Change Specification: <bounded change outcome>

## Specification status and ratification request
<Draft | ready for ratification | ratified | rejected | superseded; exact
decision requested and authority.>

## Sources and provenance
<Signals, Observations, Pitch, Defect Reports, incidents, evidence, and claim
maturity.>

## Problem and intended outcome
<Current condition, consequence, and implementation-independent outcome.>

## Scope, boundaries, and non-goals
<Included and excluded actors, behavior, data, interfaces, environments, and
time horizon.>

## Intent change
<Unchanged or proposed Intent meaning and authority.>

## Requirements change
<Exact Requirement identities, dispositions, before/after meaning, lineage,
authority, gaps, and blockers.>

## Architecture change
<Exact Architecture identities and dispositions; responsibilities,
boundaries, interfaces, interactions, data/state, qualities, operations,
decisions, views, unchanged meaning, gaps, and blockers.>

## Evaluations
<Exact Requirement-satisfaction and Architecture-realization Protocol
identities, roles, targets, semantic claims, coverage, judgment, evidence
expectations, lifecycle, authority, gaps, and blockers.>

## Constraints and invariants
<Material constraints and meaning an acceptable response must preserve.>

## Risks and open decisions
<Consequential risks, unknowns, decision owners, and action-relative blockers.>

## Authority and ratification
<Who may accept each semantic delta and the decisions actually recorded.>

## Corpus change
<No impact, consulted meaning, candidate gaps, accepted semantic deltas, or
representation maintenance.>
```

## Completion criteria

### Ready for ratification

- The Change boundary and intended outcome are recognizable.
- Sources, claims, assumptions, and decisions remain distinguishable.
- Every affected Requirement and Architecture authority has an exact
  disposition and complete ratifiable meaning.
- Every required semantic Protocol exists with an adequate contract.
- Constraints, risks, gaps, and ratification authority are visible.
- The specification contains no technical-response or delivery decisions it
  does not own.

### Ratified

The applicable human authorities accepted the exact semantic deltas and the
artifact identifies that revision. Ratification does not establish Change
coherence, implementation readiness, delivery, or verification.

### Draft but blocked for a later action

A draft may be complete enough to report or review while a named gap blocks
ratification, coherence, planning, or mutation. State the blocked action rather
than calling the whole artifact incomplete.

## Final check

- The artifact is bound to one Change and uses the canonical contract.
- Bugfix classification, when applicable, changes conditional content rather
  than the artifact type.
- Why and what remain separate from how and delivery.
- No accepted meaning or authority was inferred from format, status, or polish.
