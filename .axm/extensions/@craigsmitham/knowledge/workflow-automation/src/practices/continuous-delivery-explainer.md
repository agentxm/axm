---
type: Explanation
title: Continuous delivery
description: How continuous delivery keeps changes releasable through reliable automation while leaving release timing as a deliberate decision.
tags: [workflow, practice, continuous-delivery, release, deployment]
status: draft
sources:
  - id: continuous-delivery-foundation
    resource: https://continuousdelivery.com/
    title: Continuous Delivery
  - id: dora-cd
    resource: https://dora.dev/capabilities/continuous-delivery/
    title: DORA — Continuous delivery
  - id: fowler-cd
    resource: https://martinfowler.com/bliki/ContinuousDelivery.html
    title: Martin Fowler — Continuous Delivery
generated:
  by: codex/gpt-5.6
  at: 2026-08-21T22:05:43Z
---

# Continuous delivery

**Continuous delivery** is the practice of keeping software changes in a state
from which they can be released safely, quickly, and sustainably on demand. A
qualifying change proceeds through repeatable build, validation, and deployment
automation; whether and when to expose it to users remains a deliberate
decision.

Continuous delivery extends continuous integration beyond proving that changes
combine successfully. It makes the path to a production-like or production
target routine and keeps the system releasable rather than assembling a special
release process at the end.[^fowler-cd] DORA frames the capability around being
able to release changes of all kinds on demand in a safe, quick, and sustainable
way.[^dora-cd]

For the complete comparison with continuous integration and continuous
deployment, use [Continuous integration, delivery, and
deployment](continuous-integration-delivery-and-deployment.md).

[^fowler-cd]: Martin Fowler — Continuous Delivery

[^dora-cd]: DORA — Continuous delivery

## The releasable state

“Releasable” is an evidence-backed condition, not a label applied to an
artifact. The exact evidence depends on the system, but the delivery process
should establish that the identified candidate has passed the required checks,
can be deployed through the ordinary mechanism, and has an understood recovery
path.

This condition decays when environments drift, deployment steps depend on
undocumented intervention, results apply to a different artifact than the one
to be released, or validation is deferred into a large release event.

## Workflow expression

Continuous delivery commonly composes three patterns:

1. A [pipeline](../patterns/pipeline-explainer.md) accumulates evidence as a
   candidate progresses.
2. [Build once and promote](../patterns/build-once-promote-explainer.md) keeps
   the identity of that candidate stable across validation and targets.
3. [Quality gates](../patterns/quality-gate-explainer.md) make progression
   criteria and intentional release decisions explicit.

In the workflow model, tasks build, inspect, package, deploy, and verify; data
objects preserve the candidate and its provenance; targets represent
environments or systems; and gates control progression based on evidence or
policy. A manual release decision can therefore be one gate in an otherwise
automated path without contradicting continuous delivery.

## Operating conditions

The practice depends on more than a deployment workflow:

- changes are integrated continuously and remain small enough to evaluate;
- build, test, configuration, and deployment are repeatable;
- the same candidate advances through the delivery path;
- production-like feedback is available before a routine release decision;
- changes to application, infrastructure, configuration, and data follow
  compatible versioning and recovery disciplines; and
- releasing is a low-drama operational action rather than a special project.

The Continuous Delivery community describes the discipline as working so
software can be released at any time, through reliable and repeatable
automation.[^continuous-delivery-foundation]

[^continuous-delivery-foundation]: Continuous Delivery

## Quality consequences

| Concern       | What good continuous delivery makes possible                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Effectiveness | The release decision refers to an identifiable candidate with sufficient evidence for its intended target.                              |
| Performance   | Lead time from integrated change to releasable candidate is short and predictable.                                                      |
| Efficiency    | Validation and deployment are routine, reusable flow rather than duplicated release-period work.                                        |
| Dependability | Artifact identity, environment behavior, failure propagation, and recovery are coherent across the path.                                |
| Experience    | Authors, reviewers, and operators can see where a candidate is, what evidence exists, what blocks it, and how to release or recover it. |
| Safety        | Permissions, approvals, rollout controls, and effects are proportionate to the target and change.                                       |

## Signals that the name exceeds the practice

- A separate stabilization phase is required before most releases.
- Later environments rebuild the candidate or apply untracked changes.
- Deployment succeeds only through expert improvisation.
- The pipeline is green while the candidate is not actually deployable.
- Routine releases require long freezes, large coordination events, or
  repeated manual evidence gathering.
- Recovery exists as a document but is not part of the ordinary delivery
  design.

## Related

- [Continuous integration, delivery, and deployment](continuous-integration-delivery-and-deployment.md)
- [Continuous integration](continuous-integration-explainer.md)
- [Continuous deployment](continuous-deployment-explainer.md)
- [Pipeline](../patterns/pipeline-explainer.md)
- [Build once and promote](../patterns/build-once-promote-explainer.md)
