---
type: Guide
title: Writing Change Specifications
description: Use when one bounded Change needs a complete account of why and what must change; specify exact Intent, Requirement, Architecture, constraint, and semantic Evaluation Protocol changes without selecting the technical response or coordinating delivery.
tags: [change, change-specification, intent, requirements, architecture, evaluation-protocols, artifact-lifecycle, open-items, artifact-contract]
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
- shared artifact state, decisions, authority, and Open items.

It does not own technical alternatives, implementation structure, executable
test realization, Implementation-conformance Evaluations, delivery state,
overall Change coherence, or the next delivery action.

## 1. Bind one Change

Identify the Change and its current classification, source links, authority,
and requested specification decision. If the request is still unbounded, keep
it as a Signal or shape a Pitch. Do not create multiple Changes merely because
several source records or Defects are involved.

When an exact Pitch is present, `$spec` first verifies that it is persisted
`Ready` with no Open items and accepts it in place. A missing Pitch permits
direct-entry Draft work; a Draft, stale, or unverified Pitch is not accepted.

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

A missing required semantic Protocol can remain visible in Draft. It blocks
Ready state, Change coherence, and dependent planning.

## 7. Record constraints, risks, authority, and Open items

Record only material legal, policy, compatibility, accessibility, performance,
security, privacy, safety, operational, migration, rollout, rollback, and
recovery constraints. Preserve invariants that an acceptable Design must
conserve.

Put each blocker in Open items with its responsible authority role and
observable resolution condition. Keep non-blocking risks elsewhere. State the
authority that may ratify each governed semantic change. Specification state
never substitutes for that authority.

## 8. Reconcile with Design without absorbing it

When a Change Design exists, compare its implications with the exact Change
Specification revision. Return any changed outcome, obligation, durable
boundary, Architecture decision, or semantic Protocol claim to its owner.

Record the resulting exact Specification revision and decisions here. The
Design records reconciliation against that revision. Their current states,
bindings, and Open items in the canonical Change target determine coherence;
no separate coordination handoff is needed.

## Representation

Native host fields may satisfy this semantic contract. In a Markdown-only host
or conversation, use this exact fallback. Keep the control sections and every
required semantic disposition. Write `No change.` when a required dimension is
unchanged; omit only sections marked optional.

```markdown
# Change Specification: <bounded change outcome>

> **Artifact:** <stable Specification identity and exact revision>
> **State:** `<Draft | Ready | Accepted>`
> **Canonical:** <work item, native field set, body region, or exact link>
> **Bound to:** <exact accepted Pitch identity and revision; omit for direct entry>

## Summary

<Implementation-independent current condition, consequence, and intended
outcome.>

## Open items

- **OI-1 — <blocker>**
  - **Authority:** <responsible role>
  - **Resolves when:** <observable condition>

## Sources

- <Exact Signal, Observation, Pitch, Defect Report, incident, evidence, or
  other source with claim maturity.>

## Scope

- **In scope:** <actors, behavior, data, interfaces, environments, and horizon>
- **Out of scope:** <explicit boundaries and non-goals>

## Meaning changes

### Intent

<`No change.` or exact proposed Intent meaning and authority.>

### Requirements

#### <Requirement ID> — <add | revise | retire | unchanged>

- **Before:** <exact current meaning or none>
- **After:** <complete proposed meaning or none>
- **Lineage:** <predecessor, successor, derivation, or none>
- **Authority:** <role and decision actually recorded>

### Architecture

#### <Architecture ID> — <add | revise | retire | unchanged>

- **Before:** <exact current responsibility, boundary, or decision>
- **After:** <complete proposed responsibility, boundary, or decision>
- **Authority:** <role and decision actually recorded>

## Evaluation obligations

### <Protocol ID> — <add | revise | retire | unchanged>

- **Role and targets:** <Requirement satisfaction or Architecture realization;
  exact authorities>
- **Claim and coverage:** <semantic claim and bounded coverage>
- **Judgment and evidence:** <how a Result supports the claim>
- **Lifecycle and authority:** <maintainer, decision role, and revision policy>

## Constraints and invariants

<Material constraints and meaning an acceptable response must preserve.>

## Residual risks

- **<risk>:** <consequence, owner, and decision or observation trigger>

## Corpus effect

<Optional when material: no impact, consulted meaning, candidate gaps,
accepted semantic deltas, or representation maintenance.>
```

Repeat the Requirement, Architecture, and Protocol cards as needed. When a
required category has no entries, write `No change.` under that category. For
`Ready` or `Accepted`, write `- None.` under Open items. Record authority beside
the meaning it governs; add no second generic authority section.

## Completion criteria

### Ready for Design

- The Change boundary and intended outcome are recognizable.
- Sources, claims, assumptions, and decisions remain distinguishable.
- Every affected Requirement and Architecture authority has an exact
  disposition and complete ratifiable meaning.
- Every required semantic Protocol exists with an adequate contract.
- Constraints, risks, authority, and decisions are visible.
- Open items contains `- None.` and authoritative readback verifies the exact
  Ready artifact.
- The specification contains no technical-response or delivery decisions it
  does not own.

### Accepted

A valid `$design` invocation accepted the exact persisted Ready Specification
before dependent Design work. Governed semantic deltas still require their
applicable human authorities; artifact acceptance does not create that
authority or establish implementation readiness.

### Draft

A Draft may be complete enough to report or review while a named gap blocks
Ready state, coherence, planning, or mutation. State the blocked action rather
than calling the whole artifact incomplete.

## Final check

- The artifact is bound to one Change and uses the canonical contract.
- Bugfix classification, when applicable, changes conditional content rather
  than the artifact type.
- Why and what remain separate from how and delivery.
- No accepted meaning or authority was inferred from format, status, or polish.
