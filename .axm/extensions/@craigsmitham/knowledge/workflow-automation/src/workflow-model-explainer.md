---
type: Explanation
title: Workflow model
description: A portable definition/runtime taxonomy for workflow automation and mappings to the object models of major platforms.
tags: [workflow, model, taxonomy, pipeline, job, step, runner, vendor-mapping]
status: draft
stale_after: 2027-02-08
sources:
  - id: github-actions
    resource: https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows
    title: GitHub Actions workflows
  - id: gitlab-pipelines
    resource: https://docs.gitlab.com/ci/pipelines/
    title: GitLab CI/CD pipelines
  - id: azure-concepts
    resource: https://learn.microsoft.com/en-us/azure/devops/pipelines/get-started/key-pipelines-concepts?view=azure-devops
    title: Azure Pipelines key concepts
  - id: circleci-concepts
    resource: https://circleci.com/docs/guides/about-circleci/concepts/
    title: CircleCI concepts
  - id: buildkite-steps
    resource: https://buildkite.com/docs/pipelines/configure/defining-steps
    title: Buildkite defining pipeline steps
  - id: jenkins-pipeline
    resource: https://www.jenkins.io/doc/book/pipeline/
    title: Jenkins Pipeline
  - id: tekton-overview
    resource: https://tekton.dev/docs/concepts/overview/
    title: Tekton overview
  - id: argo-concepts
    resource: https://argoproj.github.io/argo-workflows/workflow-concepts/
    title: Argo Workflows core concepts
  - id: aws-codepipeline
    resource: https://docs.aws.amazon.com/codepipeline/latest/userguide/concepts.html
    title: AWS CodePipeline concepts
  - id: google-cloud-build
    resource: https://docs.cloud.google.com/build/docs/overview
    title: Google Cloud Build overview
  - id: cloudflare-ci
    resource: https://blog.cloudflare.com/ci-workflows/
    title: Cloudflare — Run CI/CD for millions of repos
generated:
  by: openai/gpt-5
  at: 2026-08-08T16:15:49Z
---

# Workflow model

Vendor terms such as _pipeline_, _workflow_, _stage_, _job_, _task_, _action_,
and _step_ do not form one portable hierarchy. Buildkite configuration steps
become runtime jobs, while Cloudflare workflow steps may run concurrently in
isolated sandboxes with their own retry and timeout behavior.[^buildkite-steps][^cloudflare-ci]
The model therefore separates definition from runtime and treats vendor nouns
as mappings onto semantic roles and properties.

[^buildkite-steps]: Buildkite defining pipeline steps

[^cloudflare-ci]: Cloudflare — Run CI/CD for millions of repos

## Definition plane

| Object                   | Meaning                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Workflow definition**  | Versioned automation specification: intended outcome, topology, logic, defaults, and policy references |
| **Component**            | Reusable workflow, task, action, template, command, or other callable definition                       |
| **Work-unit definition** | Addressable node in the workflow graph, possibly containing other work units                           |

## Runtime plane

| Object            | Meaning                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| **Invocation**    | Request to execute: trigger, actor, time, inputs, subject revision, and reason                                 |
| **Workflow run**  | One execution of a workflow definition                                                                         |
| **Work-unit run** | Runtime realization of one work-unit definition within a workflow run                                          |
| **Attempt**       | One try of a workflow or work-unit run; retry creates another attempt rather than changing what the unit means |
| **Executor**      | Agent, runner, worker, machine, pod, container, sandbox, or managed service performing work                    |

## Context plane

| Object          | Meaning                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| **Data object** | Input, output, result, artifact, cache entry, workspace, checkpoint, or other information carried or preserved |
| **Target**      | Environment, service, repository, registry, infrastructure resource, or other system observed or affected      |

The split matters operationally. A work-unit definition may be reused many
times; a work-unit run has a particular status and timing; an attempt explains
retry cost and history; an executor explains queueing, isolation, and resource
behavior.

## Work-unit roles

A work unit is recursive and has one primary role:

- **Group** — organizes work or establishes a policy boundary, such as a phase
  or stage.
- **Task** — performs computation or causes an effect.
- **Gate** — waits, approves, evaluates, or controls progression.
- **Call** — invokes another workflow or reusable component.

Treat something as a work unit when the platform gives it addressable behavior:
identity, status, timing, dependency, retry, timeout, logs, or policy. Commands
that appear only inside an undivided log can remain implementation detail.

## Relationships

The model uses a small set of explicit relationships:

| Relationship       | Question answered                                        |
| ------------------ | -------------------------------------------------------- |
| **contains**       | Which definition or group owns this work?                |
| **depends on**     | What must be satisfied before this work may proceed?     |
| **passes data to** | Which information crosses a work boundary?               |
| **runs on**        | Which executor performs this run or attempt?             |
| **triggered by**   | Which event, actor, schedule, or parent caused this run? |
| **affects**        | Which target is read, changed, promoted, or reconciled?  |

Containment is not execution order. Order and concurrency come from dependency
and condition relationships. Likewise, data availability should not be assumed
merely because two units are visually adjacent.

## Behavioral properties

Do not infer behavior from a platform label. Record these properties on the
relevant workflow or work unit:

- scheduling, queueing, priority, and supersession
- dependency, condition, concurrency, and cancellation
- executor selection, isolation, workspace, and resource allocation
- timeout, retry, backoff, idempotency, and resumption
- inputs, outputs, side effects, artifacts, caches, and checkpoints
- permissions, secrets, approvals, and trust boundaries
- status, timing, logs, test results, provenance, and control surfaces

A platform may allocate an executor at what it calls a job, task, step, or
action. Retry may occur at a different boundary from scheduling. Those are
properties of the mapped object, not universal definitions of the noun.

## Platform mappings

| Platform                                    | Mapping to this model                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions[^github-actions]             | Workflow → definition; workflow run → run; job → composite work unit with runner allocation; step → nested task; runner → executor                                      |
| GitLab CI/CD[^gitlab-pipelines]             | Configuration → definition; pipeline → run; stage → group; job → independently run task; runner → executor; script commands are usually below the first-class model     |
| Azure Pipelines[^azure-concepts]            | Pipeline → definition; pipeline run → run; stage → group; job → execution boundary; step/task/script → nested task; agent → executor                                    |
| CircleCI[^circleci-concepts]                | Pipeline and workflow definitions form nested orchestration; triggered pipeline/workflow → runs; job → composite work unit; step → nested task; executor → executor     |
| Buildkite[^buildkite-steps]                 | Pipeline → definition; build → run; configured command step → work-unit definition; generated job → work-unit run; agent → executor                                     |
| Jenkins[^jenkins-pipeline]                  | Pipeline → definition; build → run; stage → group; Pipeline step → work unit; agent/node/executor allocation → executor context                                         |
| Tekton[^tekton-overview]                    | Pipeline → definition; PipelineRun → run; Task → reusable composite work unit; TaskRun → work-unit run; Step → nested task; Kubernetes Pod → executor boundary          |
| Argo Workflows[^argo-concepts]              | Workflow object combines definition and live run state; template → component; DAG task or steps entry → work unit; pod/container → executor                             |
| AWS CodePipeline[^aws-codepipeline]         | Pipeline → definition; pipeline execution → run; stage → group; action → task or gate; action provider → executor/service; artifact → data object                       |
| Google Cloud Build[^google-cloud-build]     | Build configuration → definition; build → run; build step → work unit executed in a container; worker pool/managed infrastructure → executor context                    |
| Cloudflare Workflows and CI[^cloudflare-ci] | Workflow → definition; instance → run (also described as the CI job); `runner()` or `step.do()` → work unit; Sandbox/Workers runtime → executor; snapshot → data object |

[^github-actions]: GitHub Actions workflows

[^gitlab-pipelines]: GitLab CI/CD pipelines

[^azure-concepts]: Azure Pipelines key concepts

[^circleci-concepts]: CircleCI concepts

[^jenkins-pipeline]: Jenkins Pipeline

[^tekton-overview]: Tekton overview

[^argo-concepts]: Argo Workflows core concepts

[^aws-codepipeline]: AWS CodePipeline concepts

[^google-cloud-build]: Google Cloud Build overview

## Limits of the model

This is a comparison model, not a lowest-common-denominator execution
specification. It intentionally preserves platform-specific distinctions as
properties and notes rather than pretending that all jobs or steps behave the
same. A mapping should be revised when it hides a consequential scheduling,
isolation, data, policy, or observability boundary.

## Related

- [Workflow automation](workflow-automation-explainer.md)
- [Pipeline](patterns/pipeline-explainer.md)
- [Quality gate](patterns/quality-gate-explainer.md)
