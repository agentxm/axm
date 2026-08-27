---
type: Guide
title: Analyzing Requirement impact
description: Use when a work-item Signal may imply a change to desired state; Orient it against current authority before it becomes an unsupported Requirement or Implementation commitment.
tags: [ooda, orientation, signals, observations, work-items, requirement-impact, defects, features, incidents, delivery]
sources:
  - id: ooda-control-loop
    resource: /control-loop/ooda-control-loop.md
    title: OODA as the Gen Stack control loop
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T22:30:00Z
---

# Analyzing Requirement impact

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide whenever a software work item may affect accepted desired state
or evidence about it. The analysis records a relationship; it does not accept,
change, or retire a Requirement.

This is a bounded Orientation activity. Preserve the originating Signal and
its Observations, classify them against existing authority, and leave the
result unresolved when the evidence cannot support a repair
hypothesis.[^ooda-control-loop]

## Representation

Keep this transient analysis in the work item, review, or conversation that
owns the current Orientation. Present it in this preferred order: originating
Signal and observations, applicable Requirement IDs, classification, evidence
and uncertainty, Architecture and Evaluation consequences, candidate next
step, blocking status, and authority needed. Use native links and fields where
their semantics match, do not copy canonical Requirement expressions, and do
not invent a persistent identity or profile metadata for the analysis itself.

## Classify the relationship

Choose one or more only when supported:

| Classification | Meaning |
| --- | --- |
| `possible non-satisfaction` | Observed or suspected behavior may fail an existing Requirement |
| `candidate new obligation` | The request may justify a Requirement that has not been accepted |
| `proposed change or retirement` | The work questions an existing Requirement's desired state or continued force |
| `implementation-only` | Accepted desired state appears unchanged; Implementation may change |
| `evidence or interpretation gap` | The Requirement, evaluation, or their relationship is ambiguous, missing, stale, or insufficient |
| `unresolved` | Available evidence cannot yet classify the relationship honestly |

Record stable Requirement IDs and links when they exist. Do not copy the
Requirement into the work item as another normative statement. A short quoted
or paraphrased predicate may provide reader context when its authority and link
remain explicit.

This classification does not select a Requirement operation. When supported
analysis identifies a candidate new obligation or proposed change or
retirement, continue with [Specifying Requirement changes in software work
items](../work-items/specifying-requirement-changes.md). That guide distinguishes
addition, same-identity revision, retirement, replacement, split, merge,
representation-only maintenance, and unresolved identity. Possible
non-satisfaction and implementation-only work normally stop here.

## Assess cross-stack meaning gaps

Requirement impact may expose missing, underdeveloped, misplaced, disputed, or
contradicted Architecture and Requirement meaning. Apply [Developing candidate
Architecture and
Requirements](/architecture/developing-candidate-architecture-and-requirements.md)
when any such gap is material, then use only the implicated [Surface](/architecture/surfaces/developing-surfaces.md),
[C4 structure](/architecture/structure/developing-c4-structure.md), or
[Requirement](/architecture/requirements/developing-requirements.md) guide.

Record each material gap with:

```text
Gap and implicated element:
Evidence and confidence:
Impact on the current work item or action:
Options or candidate correction:
Recommendation:
Applicable authority:
Blocking status: blocking | non-blocking
```

Use `blocking` only when the missing meaning prevents a truthful or safe next
action. A Bugfix whose corrected behavior has no accepted basis is blocked
before delivery, while its Defect Report can still preserve the observation and
gap. Use `non-blocking` when the current artifact can proceed honestly—for
example, when an accepted correction can be specified while a missing
Evaluation Protocol is separately recommended.

Do not call a missing document a Defect unless an applicable expectation or
intended use establishes that deficiency. Do not make every gap a decision
gate; surface it and continue when it does not control the authorized action.

## Work-item block

Use the smallest useful subset of:

```text
Signal:
Observations and evidence:
Applicable Requirements:
Relationship to desired state:
Architecture impact:
Evidence impact:
Cross-stack gaps and blocking status:
Required authority:
Next route: impact only | specify Requirement change
Unknowns:
```

`Architecture impact` names an affected responsibility, boundary, decision, or
response without designing it. `Evidence impact` names evaluations that may
need creation, correction, rerun, or reinterpretation. `Required authority`
identifies who or what can accept a Requirement change or resolve a conflict.

## Apply proportionately through lifecycle

- At raw intake, `unresolved` is often the truthful result.
- Before commitment, resolve enough impact to avoid treating a candidate
  obligation or disputed expectation as implementation authority.
- During delivery, maintain links when accepted Requirements, architecture, or
  evaluation definitions change.
- At closure, account for every claimed Requirement impact: satisfied,
  superseded, rejected, deferred with an owner, or still unknown.

An evaluation failure does not prove which artifact is wrong. A source request
or proposed Change Specification does not become a Requirement because a
verification condition can be written. Keep those boundaries visible in the
item.

[^ooda-control-loop]: [OODA as the Gen Stack control loop](/control-loop/ooda-control-loop.md)
    defines Orientation as evidence-bound interpretation rather than authority
    to change desired state.
