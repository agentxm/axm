---
type: Explanation
title: Continuous integration
description: Why continuous integration is the practice of integrating small changes frequently and verifying each integration, not merely running a CI service.
tags: [workflow, practice, continuous-integration, feedback, mainline]
status: draft
sources:
  - id: fowler-ci
    resource: https://martinfowler.com/articles/continuousIntegration.html
    title: Martin Fowler — Continuous Integration
  - id: dora-ci
    resource: https://dora.dev/capabilities/continuous-integration/
    title: DORA — Continuous integration
generated:
  by: codex/gpt-5.6
  at: 2026-08-21T22:05:43Z
---

# Continuous integration

**Continuous integration (CI)** is the practice of integrating small changes
into a shared mainline frequently and verifying each integration with an
automated build and tests. A failed integration is made visible and repaired
promptly so the mainline remains a trustworthy basis for further work.

The frequency and shared-mainline behavior are essential. Martin Fowler
describes developers integrating at least daily, with each integration
verified by an automated build.[^fowler-ci] DORA likewise treats small,
frequent merges, comprehensive automated testing, and rapid repair of a broken
build as characteristics of the practice.[^dora-ci]

For the boundary from continuous delivery and continuous deployment, use
[Continuous integration, delivery, and
deployment](continuous-integration-delivery-and-deployment.md).

[^fowler-ci]: Martin Fowler — Continuous Integration
[^dora-ci]: DORA — Continuous integration

## CI is a practice, not a service

A platform may label any triggered validation as “CI.” Running checks on a
long-lived branch is useful automation, but it does not by itself establish
continuous integration. The practice also depends on how people divide work,
how long changes remain unintegrated, what the automated result establishes,
and how the team responds when integration fails.

Pre-merge checks and branch workflows can support CI when they shorten the path
to mainline and provide timely evidence. They undermine it when large changes
wait in queues, branches diverge for days, or a green branch result masks that
the combined mainline has not been verified.

## Workflow expression

In the workflow model:

* a source change or mainline revision is the invocation subject;
* tasks build and test the integrated state;
* a pipeline orders fast, informative checks and later confidence-building
  work;
* quality gates may prevent known-bad changes from progressing;
* outputs include evidence tied to the exact revision tested; and
* the run result must reach the people who can restore the mainline.

CI workflows usually benefit from early failure visibility, explicit
dependencies, cancellation or supersession of obsolete runs, reproducible
inputs, and selective reruns that do not obscure the authoritative result.

## Operating conditions

The practice is sustained when:

* changes are small enough to integrate and diagnose quickly;
* every contributor integrates frequently rather than accumulating private
  divergence;
* the automated build is repeatable and provides useful evidence promptly;
* the shared mainline is the source of truth; and
* a broken mainline interrupts normal change flow until it is repaired or the
  offending change is removed.

These conditions are social and technical. Improving workflow speed while
changes remain large and infrequent does not produce CI; reducing batch size
while feedback remains too slow to act on does not sustain it either.

## Quality consequences

| Concern | What good CI makes possible |
| --- | --- |
| Effectiveness | Each integrated revision has evidence for the checks the team claims it satisfies. |
| Performance | Authors receive actionable feedback soon enough to retain context and integrate again. |
| Efficiency | Small batches reduce rework and diagnosis scope; obsolete or duplicated validation does not consume the feedback path. |
| Dependability | The same revision and inputs produce trustworthy results, and a broken mainline is unmistakable. |
| Experience | Authors can find the failing work unit, evidence, ownership, and next action without reconstructing the workflow. |

## Signals that the name exceeds the practice

* Changes commonly remain unintegrated for days.
* Integration happens in large batches or dedicated integration phases.
* A green check does not identify the revision and evidence it covers.
* Failures are routinely retried until green without explaining the
  nondeterminism.
* The mainline is allowed to remain broken while unrelated work accumulates.
* Feedback arrives after the author has moved on and must reload the problem
  context.

## Related

* [Continuous integration, delivery, and deployment](continuous-integration-delivery-and-deployment.md)
* [Workflow model](../workflow-model-explainer.md)
* [Pipeline](../patterns/pipeline-explainer.md)
* [Quality gate](../patterns/quality-gate-explainer.md)
* [Continuous delivery](continuous-delivery-explainer.md)
