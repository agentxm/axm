---
type: Explanation
title: Continuous deployment
description: How continuous deployment automatically releases every qualifying change and what that demands from validation, exposure, observability, and recovery.
tags: [workflow, practice, continuous-deployment, release, production]
status: draft
sources:
  - id: delivery-vs-deployment
    resource: https://continuousdelivery.com/2010/08/continuous-delivery-vs-continuous-deployment/
    title: Continuous Delivery vs Continuous Deployment
  - id: fowler-cd
    resource: https://martinfowler.com/bliki/ContinuousDelivery.html
    title: Martin Fowler — Continuous Delivery
  - id: dora-cd
    resource: https://dora.dev/capabilities/continuous-delivery/
    title: DORA — Continuous delivery
generated:
  by: codex/gpt-5.6
  at: 2026-08-21T22:05:43Z
---

# Continuous deployment

**Continuous deployment** is the practice of automatically releasing every
qualifying change to users or a production target without a separate routine
deployment decision. A candidate that satisfies the delivery policy progresses
automatically; a candidate that does not is stopped by explicit evidence or
policy.

Continuous deployment therefore implies a continuous-delivery capability, but
continuous delivery does not require continuous deployment. The distinction is
whether the final production release is automatic or remains a deliberate
business decision.[^delivery-vs-deployment][^fowler-cd]

For the complete comparison with continuous integration and continuous
delivery, use [Continuous integration, delivery, and
deployment](continuous-integration-delivery-and-deployment.md).

[^delivery-vs-deployment]: Continuous Delivery vs Continuous Deployment
[^fowler-cd]: Martin Fowler — Continuous Delivery

## Deployment, release, and exposure

Platforms use *deployment* differently, so evaluate the effect rather than the
label. Placing code in a production environment, activating it, and exposing it
to users may be one action or several. Feature flags, staged rollout, traffic
shifts, and tenant controls can separate technical deployment from user
release.

A workflow practices continuous deployment when its normal policy
automatically carries every qualifying change to the defined production
effect. If automation merely uploads an artifact while activation routinely
waits for a person, the practice is continuous delivery to that boundary, not
continuous deployment of the user-visible change.

## Workflow expression

Continuous deployment uses the same pipeline, artifact identity, and quality
gate patterns as continuous delivery, but the terminal gate is policy-driven
rather than a routine human approval. The workflow should make four transitions
visible:

1. which exact candidate qualified;
2. which evidence and policy authorized progression;
3. which target or audience received the change; and
4. what post-deployment evidence confirmed, limited, or reversed the effect.

Progressive exposure can reduce the consequence of an incorrect decision, but
it does not replace qualification. Production verification can detect behavior
that earlier environments could not, but it does not make avoidable pre-release
evidence optional.

## Operating conditions

The practice is credible when:

* continuous integration and delivery keep every candidate small, identifiable,
  and releasable;
* automated evidence is strong enough to authorize production progression;
* production health and the effect of each change are observable promptly;
* rollout can be limited, halted, or reversed without an exceptional process;
* database, infrastructure, configuration, and compatibility changes tolerate
  frequent independent progression; and
* people improve the policy and system rather than serving as an implicit gate
  for every routine change.

DORA treats continuous delivery as a prerequisite capability: software must be
releasable on demand safely and sustainably before automating every qualifying
release can be a sound operating choice.[^dora-cd]

[^dora-cd]: DORA — Continuous delivery

## Quality consequences

| Concern | What good continuous deployment requires |
| --- | --- |
| Effectiveness | Qualification evidence and production verification establish the intended outcome for the exact released candidate. |
| Performance | The path from integration to exposure is short enough to support small batches and rapid learning. |
| Efficiency | Automation removes routine release coordination without converting weak checks, retries, or excess compute into hidden waste. |
| Dependability | Policy, targeting, idempotence, failure handling, and recovery behave consistently under frequent execution. |
| Experience | People can see what changed, why it progressed, who or what received it, its current health, and the available controls. |
| Safety | Blast radius, permissions, rollout rate, stopping conditions, and recovery are explicitly bounded. |

## Signals that the name exceeds the practice

* A person routinely decides whether an otherwise-qualified candidate may
  proceed to the defined production effect.
* “Automatic deployment” stops before normal user exposure without making that
  boundary explicit.
* Repeated retries substitute for trustworthy qualification.
* Production changes cannot be correlated with their candidate and evidence.
* Rollback is the only recovery strategy even when changes are not safely
  reversible.
* Automation increases change frequency while detection and containment remain
  slower than the resulting risk demands.

## When not to adopt it

Continuous deployment is not a maturity badge or a universal requirement.
Regulatory obligations, coordinated physical effects, contractual release
windows, irreversible changes, or product strategy may require a deliberate
release decision. Continuous delivery still improves those systems by making
the decision about *whether and when* to release rather than *whether release
work can be made to succeed*.

## Related

* [Continuous integration, delivery, and deployment](continuous-integration-delivery-and-deployment.md)
* [Continuous delivery](continuous-delivery-explainer.md)
* [Continuous integration](continuous-integration-explainer.md)
* [Quality gate](../patterns/quality-gate-explainer.md)
* [Build once and promote](../patterns/build-once-promote-explainer.md)
