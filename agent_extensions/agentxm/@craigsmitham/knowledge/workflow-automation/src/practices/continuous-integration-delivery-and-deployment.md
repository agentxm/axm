---
type: Reference
title: Continuous integration, delivery, and deployment
description: Distinguishes continuous integration, continuous delivery, and continuous deployment by the change-flow commitment, evidence, and release decision each practice owns.
tags: [workflow, continuous-integration, continuous-delivery, continuous-deployment, release, deployment, practices, boundaries]
status: draft
sources:
  - id: fowler-ci
    resource: https://martinfowler.com/articles/continuousIntegration.html
    title: Martin Fowler — Continuous Integration
  - id: dora-ci
    resource: https://dora.dev/capabilities/continuous-integration/
    title: DORA — Continuous integration
  - id: continuous-delivery-foundation
    resource: https://continuousdelivery.com/
    title: Continuous Delivery
  - id: dora-cd
    resource: https://dora.dev/capabilities/continuous-delivery/
    title: DORA — Continuous delivery
  - id: delivery-vs-deployment
    resource: https://continuousdelivery.com/2010/08/continuous-delivery-vs-continuous-deployment/
    title: Continuous Delivery vs Continuous Deployment
generated: { by: codex/gpt-5.6, at: 2026-08-21T22:05:43Z }
---

# Continuous integration, delivery, and deployment

Continuous integration, continuous delivery, and continuous deployment are
related practices, not interchangeable names for automation products or
pipeline stages. This reference owns their comparative boundary; the focused
practice explainers own each practice's rationale, operating conditions, and
quality consequences.

## Comparison

| Practice | Change-flow commitment | Evidence must establish | Routine progression stops when | Release decision |
| --- | --- | --- | --- | --- |
| **Continuous integration** | Contributors integrate small changes into a shared mainline frequently | The exact integrated revision passed the checks the team claims | Integration fails or the mainline cannot be trusted | Outside the practice's defining boundary |
| **Continuous delivery** | Every accepted change remains safely and sustainably releasable through the ordinary path | One identified candidate is qualified, deployable, and recoverable for its intended target | Evidence fails or an intentional release decision says not yet | May remain a deliberate human or business decision |
| **Continuous deployment** | Every qualifying change progresses automatically to a declared production effect | Policy authorizes the exact candidate and production verification confirms or contains its effect | Qualification or policy fails, or production controls stop progression | Encoded in policy; no separate routine approval for a qualifying change |

Continuous delivery normally builds on continuous integration: a change cannot
remain releasable when integration is infrequent or the shared state is
untrustworthy.[^fowler-ci][^dora-ci] Continuous deployment normally builds on
continuous delivery: automating release is unsound when a qualifying candidate
cannot already traverse a safe, repeatable, recoverable delivery path.[^dora-cd]
The Continuous Delivery community likewise frames the practice around keeping
software releasable at all times through reliable automation.[^continuous-delivery-foundation]

The implication is one-way:

```text
continuous integration → continuous delivery → continuous deployment
```

An organization can practice continuous integration without continuous
delivery, and continuous delivery without continuous deployment. The arrow
expresses an enabling relationship, not a maturity ladder that every system
must complete.

## Deployment, release, and exposure

Tool labels do not settle the classification. **Deployment** places or updates
software in an environment. **Release** makes behavior available for intended
use. **Exposure** determines which users, tenants, requests, or traffic receive
that behavior. A host may combine those effects or separate them with feature
flags, staged rollout, traffic shifting, or activation controls.

Name the production effect whose progression is automatic. Uploading an
artifact automatically while normal activation waits for a person is
continuous delivery to that boundary, not continuous deployment of the
user-visible change.[^delivery-vs-deployment]

## Selection cues

- Ask about **continuous integration** when the concern is change size,
  mainline frequency, integration evidence, or repair of a broken shared state.
- Ask about **continuous delivery** when the concern is keeping an exact
  candidate releasable through repeatable validation, deployment, and recovery.
- Ask about **continuous deployment** when the concern is whether every
  qualifying candidate advances automatically to a declared production effect.
- Ask about a pipeline, quality gate, artifact-promotion pattern, or vendor
  workflow when the concern is the automation structure rather than the
  practice enacted over time.

Continuous deployment is not universally preferable. Regulation, irreversible
effects, coordinated physical events, contractual windows, or product strategy
may require a deliberate release decision. Continuous delivery still improves
those systems by making release timing the decision instead of whether the
release process can be made to work.

[^fowler-ci]: Martin Fowler — Continuous Integration
[^dora-ci]: DORA — Continuous integration
[^dora-cd]: DORA — Continuous delivery
[^continuous-delivery-foundation]: Continuous Delivery
[^delivery-vs-deployment]: Continuous Delivery vs Continuous Deployment
