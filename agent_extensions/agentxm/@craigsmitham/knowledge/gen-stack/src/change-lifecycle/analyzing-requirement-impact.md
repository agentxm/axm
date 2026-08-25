---
type: Guide
title: Analyzing Requirement impact
description: How to classify a work item's possible effect on desired state before it becomes an unsupported requirement or implementation commitment.
tags: [work-items, requirement-impact, defects, features, incidents, delivery]
---

# Analyzing Requirement impact

Use this guide whenever a software work item may affect accepted desired state
or evidence about it. The analysis records a relationship; it does not accept,
change, or retire a Requirement.

## Classify the relationship

Choose one or more only when supported:

| Classification | Meaning |
| --- | --- |
| `possible non-satisfaction` | Observed or suspected behavior may fail an existing Requirement |
| `candidate new obligation` | The request may justify a Requirement that has not been accepted |
| `proposed change or retirement` | The work questions an existing Requirement's desired state or continued force |
| `implementation-only` | Accepted desired state appears unchanged; realization may change |
| `evidence or interpretation gap` | The Requirement, evaluation, or their relationship is ambiguous, missing, stale, or insufficient |
| `unresolved` | Available evidence cannot yet classify the relationship honestly |

Record stable Requirement IDs and links when they exist. Do not copy the
Requirement into the work item as another normative statement. A short quoted
or paraphrased predicate may provide reader context when its authority and link
remain explicit.

## Work-item block

Use the smallest useful subset of:

```text
Applicable Requirements:
Relationship to desired state:
Architecture impact:
Evidence impact:
Required authority:
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

An evaluation failure does not prove which artifact is wrong. A feature request
does not become a Requirement because a proposed acceptance test can be
written. Keep those boundaries visible in the item.
