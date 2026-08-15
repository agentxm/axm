---
type: Explanation
title: Workflow automation
description: What automated workflow systems coordinate, which use cases belong to the field, and how workflows, patterns, and practices relate.
tags: [workflow, automation, orchestration, ci-cd, explanation]
status: draft
sources:
  - id: cloudflare-workflows
    resource: https://developers.cloudflare.com/workflows/
    title: Cloudflare Workflows overview
  - id: argo-concepts
    resource: https://argoproj.github.io/argo-workflows/workflow-concepts/
    title: Argo Workflows core concepts
  - id: tekton-overview
    resource: https://tekton.dev/docs/concepts/overview/
    title: Tekton overview
  - id: cloudflare-ci
    resource: https://blog.cloudflare.com/ci-workflows/
    title: Cloudflare — Run CI/CD for millions of repos
generated:
  by: codex/gpt-5.6
  at: 2026-08-14T22:24:33Z
---

# Workflow automation

**Workflow automation** coordinates a triggered body of work toward an intended
outcome. The work may compute, wait, decide, exchange data, invoke another
workflow, or affect an external system. The defining characteristic is not a
particular file format or vendor hierarchy; it is that the coordination has an
inspectable definition and an execution whose progress and outcome can be
observed.

Durable workflow engines make this coordination explicit for long-running work:
they persist progress, wait for events, and resume or retry selected work rather
than treating the entire process as one disposable program.[^cloudflare-workflows]
Kubernetes-oriented engines expose similar ideas through pipelines, tasks,
templates, dependency graphs, and runtime resources.[^argo-concepts][^tekton-overview]

[^cloudflare-workflows]: Cloudflare Workflows overview
[^argo-concepts]: Argo Workflows core concepts
[^tekton-overview]: Tekton overview

## The subject

A workflow automation system joins six concerns:

1. **Intent** — the outcome the workflow is meant to produce or establish.
2. **Invocation** — the event, request, schedule, actor, and inputs that ask for
   one execution.
3. **Orchestration** — which work exists and how dependency, condition,
   concurrency, and policy control its flow.
4. **Execution** — where work runs, with what resources, isolation, retries,
   timeouts, and cancellation behavior.
5. **Information** — the inputs, outputs, artifacts, state, evidence, and
   provenance carried through the work.
6. **Effects** — the environments, services, repositories, infrastructure, or
   other targets changed by the workflow.

Feedback about a workflow is not the subject itself. Logs, dashboards, field
notes, and evaluations observe the definition and execution; they help improve
the system but do not constitute the automated process.

## Use-case profiles

CI/CD is a major use of workflow automation, not its universal structure.
Cloudflare's CI SDK makes this relationship unusually explicit by implementing
a CI job as a Workflow instance whose build, lint, test, and deployment work
runs as durable workflow steps.[^cloudflare-ci]

[^cloudflare-ci]: Cloudflare — Run CI/CD for millions of repos

Other profiles include:

| Profile | Intended outcome |
| --- | --- |
| Integration and validation | Establish whether a change integrates and meets stated checks |
| Build and publication | Produce and publish a versioned artifact or package |
| Delivery and deployment | Make a validated change releasable or place it in a target environment |
| Provisioning | Create or reconcile infrastructure and configuration |
| Maintenance and operations | Perform scheduled or event-driven operational work |
| Data processing | Transform, validate, and move data through dependent work |
| Durable application flow | Coordinate long waits, callbacks, approvals, or human interaction |
| Agent-contained work | Provide durable triggers, dependencies, state, approvals, retries, cancellation, and compensation around bounded agent steps |

One workflow may serve several profiles. Purpose should therefore be recorded as
context, not inferred from whether the platform calls the definition a pipeline
or workflow.

## Patterns and practices

A **pattern** is a recurring arrangement of workflow elements that resolves
forces in a context and produces both benefits and costs. A pipeline, a quality
gate, and building once before promotion are structural patterns.

A **practice** is an established way people and systems work together over
time. Continuous integration, continuous delivery, and continuous deployment
are practices. They use workflow patterns, but none is equivalent to installing
a particular automation product.

This distinction matters because a team may own a CI service without practicing
continuous integration, or draw a pipeline without maintaining a releasable
system. The automation is an implementation of the practice, not proof that the
practice exists.

## Quality is experienced across the system

A successful status is necessary but insufficient. Workflow quality includes:

* **Effectiveness and correctness** — the workflow establishes the intended
  outcome and its result means what users think it means.
* **Performance** — useful feedback and outcomes arrive with appropriate
  latency and throughput.
* **Efficiency** — compute, waiting, data movement, retries, and human attention
  are not wasted disproportionately.
* **Dependability** — repeated execution is trustworthy; failure, retry,
  cancellation, and recovery have coherent semantics.
* **Experience** — authors, reviewers, operators, and result consumers can
  understand, reproduce, navigate, and control the work.
* **Safety** — permissions and external effects are bounded, attributable, and
  recoverable where the domain permits.

Every pattern and practice in this bundle discusses these consequences in its
own context rather than treating quality as a detached universal checklist.

## Boundaries

This field guide does not make every script a workflow. A local command can be a
work unit inside a workflow, but without orchestration or an independently
observable execution it remains implementation detail. Likewise, this bundle
does not attempt to cover all business-process modeling, job scheduling,
distributed systems, testing strategy, or release management. It explains
those subjects only where they materially shape automated workflow systems.

An LLM call or graph is not automatically an agent. Workflow automation owns
defined execution structure and durable lifecycle; agent engineering owns
model-directed choice, replanning, capability policy, delegation, and stopping
inside an agent boundary. See [Agents and agentic workflows](agents-and-agentic-workflows.md).

## Related

* [Workflow model](workflow-model-explainer.md)
* [Agents and agentic workflows](agents-and-agentic-workflows.md)
* [Pipeline](patterns/pipeline-explainer.md)
* [Continuous integration](practices/continuous-integration-explainer.md)
