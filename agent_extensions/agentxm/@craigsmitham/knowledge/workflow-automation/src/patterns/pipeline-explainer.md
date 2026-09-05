---
type: Explanation
title: Pipeline
description: How a pipeline progresses a change or input through dependent work toward an outcome while accumulating evidence and confidence.
tags: [workflow, pattern, pipeline, stages, dependencies, feedback]
status: draft
sources:
  - id: fowler-deployment-pipeline
    resource: https://martinfowler.com/bliki/DeploymentPipeline.html
    title: Martin Fowler — Deployment Pipeline
  - id: aws-codepipeline
    resource: https://docs.aws.amazon.com/codepipeline/latest/userguide/concepts.html
    title: AWS CodePipeline concepts
  - id: circleci-workflows
    resource: https://circleci.com/docs/guides/orchestrate/workflows/
    title: CircleCI workflow orchestration
generated:
  by: openai/gpt-5
  at: 2026-08-08T16:15:49Z
---

# Pipeline

A **pipeline** is a workflow pattern that progresses a change, artifact, or
other input through dependent work toward an intended outcome. Its shape makes
flow visible: which evidence is produced first, which work can proceed in
parallel, which decisions control progression, and where the input stops when a
condition is not satisfied.

Deployment pipelines commonly arrange faster, cheaper checks early and slower,
more comprehensive work later so confidence increases as a candidate
progresses.[^fowler-deployment-pipeline] Platforms may express the shape through
stages and actions, or directly as a graph of job dependencies.[^aws-codepipeline][^circleci-workflows]

[^fowler-deployment-pipeline]: Martin Fowler — Deployment Pipeline
[^aws-codepipeline]: AWS CodePipeline concepts
[^circleci-workflows]: CircleCI workflow orchestration

## Context and intent

Use a pipeline when one subject must pass through a recognizable progression:
a source revision becoming a package, a candidate becoming a release, a data
batch becoming a published dataset, or a configuration change becoming a
reconciled environment.

The subject should have an identity. Without it, different work units may
silently operate on different revisions or artifacts while the interface
presents them as one progression.

## Structure in the workflow model

* The pipeline is a workflow definition; one passage is a workflow run.
* The progressing subject is an invocation input and usually a data object.
* Groups may organize phases or policy boundaries.
* Tasks transform, inspect, or publish the subject.
* Gates decide whether the subject may proceed.
* Dependency edges express actual prerequisites; data edges identify what is
  passed.
* Targets identify environments or systems affected along the way.

A pipeline need not be linear. Fan-out, fan-in, conditional paths, and nested
calls remain pipelines when they contribute to one recognizable progression.

## Forces and choices

### Fast feedback versus confidence

Early work should reject likely-bad candidates quickly, but an early green
result should not be presented as the confidence provided by later evidence.
Ordering should reflect both information value and cost, not the historical
order in which scripts were added.

### Parallelism versus dependency

Independent work may run concurrently. Work that relies on an output, shared
target, scarce resource, or policy result must declare that dependency.
Parallelism that ignores a real dependency creates races; sequence without a
dependency increases latency and hides the actual graph.

### Granularity versus overhead

Smaller work units can improve concurrency, selective retry, attribution, and
visibility. Each boundary can also add queueing, startup, transfer, and
configuration cost. The appropriate boundary follows the executor, data,
failure, and evidence needs of the work rather than a fixed number of jobs or
steps.

### Throughput versus freshness

When inputs arrive faster than the pipeline completes, the system needs an
explicit policy: queue every candidate, cap concurrency, or supersede obsolete
runs. Processing everything is correct for an audit or migration pipeline but
may be pure waste for pre-merge feedback where only the latest revision matters.

## Quality consequences

| Concern | Questions |
| --- | --- |
| Effectiveness | Does the final status establish the intended outcome for the identified subject? |
| Performance | What is the critical path? When does the first useful result arrive? |
| Efficiency | Which work is duplicated, obsolete, idle, or transferring avoidable data? |
| Dependability | Are dependencies, failure propagation, cancellation, and selective restart coherent? |
| Experience | Can a user see the subject, graph, current position, evidence, timing, and reason progression stopped? |

## Common failure forms

* **Incidental sequence** — declaration order substitutes for real dependencies.
* **Stage theater** — named stages decorate a fundamentally opaque monolith.
* **Green ambiguity** — the displayed success does not say which outcome or
  evidence it establishes.
* **Serial by default** — independent work waits because the graph was never
  expressed.
* **Parallel by hope** — work runs concurrently despite hidden data or target
  coupling.
* **Pipeline congestion** — obsolete runs consume capacity needed by current
  work.
* **Rebuild drift** — later phases recreate rather than advance the same
  subject.

## When another shape fits better

Not every workflow is meaningfully a pipeline. A periodic cleanup, long-lived
approval process, event correlation loop, or agent interaction may be better
understood as a scheduled, stateful, or event-driven workflow. Calling it a
pipeline is useful only if progression of one subject explains its behavior.

## Related

* [Workflow model](../workflow-model-explainer.md)
* [Quality gate](quality-gate-explainer.md)
* [Build once and promote](build-once-promote-explainer.md)
* [Continuous delivery](../practices/continuous-delivery-explainer.md)
