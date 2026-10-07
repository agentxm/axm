---
type: Guide
title: Resolved task contract principles
description: Use when deciding what a single repository task means — who owns it, what it guarantees from a clean shell, which dependencies it declares, and when a cache replay still answers the caller's question; the five principles that define a canonical resolved contract.
tags:
  [
    repository-task-interface,
    task-contract,
    task-ownership,
    task-dependencies,
    build-cache,
    cache-freshness,
    hermetic-builds,
    task-graph,
    monorepo,
    pe-engineering,
  ]
status: draft
sources:
  - id: nx-run-tasks
    resource: https://nx.dev/docs/features/run-tasks
    title: Nx — Run Tasks
  - id: nx-task-pipeline
    resource: https://nx.dev/docs/concepts/task-pipeline-configuration
    title: Nx — Task pipeline configuration
  - id: nx-caching
    resource: https://nx.dev/docs/concepts/how-caching-works
    title: Nx — How caching works
  - id: turborepo-configuring-tasks
    resource: https://turborepo.dev/docs/crafting-your-repository/configuring-tasks
    title: Turborepo — Configuring tasks
  - id: turborepo-environment
    resource: https://turborepo.dev/docs/crafting-your-repository/using-environment-variables
    title: Turborepo — Using environment variables
  - id: turborepo-caching
    resource: https://turborepo.dev/docs/crafting-your-repository/caching
    title: Turborepo — Caching
  - id: turborepo-remote-cache
    resource: https://turborepo.dev/docs/core-concepts/remote-caching
    title: Turborepo — Remote Caching
  - id: gradle-task-practices
    resource: https://docs.gradle.org/current/userguide/best_practices_tasks.html
    title: Gradle — Best Practices for Tasks
  - id: gradle-build-cache
    resource: https://docs.gradle.org/current/userguide/build_cache.html
    title: Gradle — Build Cache
  - id: bazel-dependencies
    resource: https://bazel.build/concepts/dependencies
    title: Bazel — Dependencies
  - id: bazel-hermeticity
    resource: https://bazel.build/concepts/hermeticity
    title: Bazel — Hermeticity
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Resolved task contract principles

These five principles define what one repository task *means*. They assume the
vocabulary and boundaries in [Designing a coherent repository task
interface](repository-task-interface.md), and they pair with
[Task invocation and conformance principles](task-invocation-and-conformance-principles.md),
which govern the paths actors use to reach a contract.

## 1. One resolved contract owns each supported intent

Each repeatable unit has one canonical identity and one resolved contract for
what executes, under which prerequisites, with which dependencies, inputs,
outputs, environment, cache behavior, and interpretation of success.

The physical declarations may be composed, inferred, or inherited when the
orchestrator natively supports that model. A package script consumed as an Nx
task or Turborepo task implementation is part of the canonical contract, not
automatically a competing interface.[^nx-run-tasks][^turborepo-configuring-tasks]
What must not happen is for callers to restate or alter semantic behavior
independently.

## 2. Intent and lifecycle determine name and ownership

Name operations for actor intent, not the tool or historical implementation.
Use one verb for one kind of work across the scope where actors transfer
knowledge. Qualifiers narrow the intent rather than repeat the subject or
configuration file.

Assign the narrowest stable semantic owner that controls the outcome and its
lifecycle:

- a project or package for a capability it builds, verifies, runs, or changes;
- the workspace for cross-cutting work with no honest project subject;
- an environment, release unit, or operational system for shared state and
  privileged mutations; or
- the host platform for lifecycle events it controls.

Root or workspace tasks are legitimate when work has no useful package scope;
Turborepo explicitly supports this case.[^turborepo-configuring-tasks]
Do not force ownership onto a project merely because its files contain the
implementation.

## 3. Supported tasks are self-sufficient within a declared boundary

A supported task invocation produces correct behavior from a clean shell once
its declared prerequisites are met. Hermetic systems go further by isolating
actions from undeclared host tools and services, which improves reproducibility
and cache safety.[^bazel-hermeticity]

Self-sufficiency does not mean the task owns every value or external system.
Separate:

- **declaration** — required files, tools, services, environment variable
  names, and permissions;
- **provisioning** — acquisition of the runner, toolchain, or local services;
- **injection** — host- or secret-manager delivery of environment-specific
  values; and
- **hashing** — which values and runtime facts can change task outputs.

Keep values such as credentials outside repository configuration. Account for
every behavior-changing environment value in the cache contract; Turborepo
documents how an omitted variable can restore output for the wrong
environment.[^turborepo-environment]

## 4. Dependencies are explicit and typed

Every actual dependency the orchestrator can model must be represented in the
resolved contract. Bazel frames correctness as requiring actual dependencies
to be included in the declared graph.[^bazel-dependencies] Caller-side
sequencing hides that information from affected selection, parallel execution,
and caching; use the runner's dependency model instead, such as Nx task-pipeline
relationships, when it expresses the required semantics.[^nx-task-pipeline]

Choose the relationship that expresses why it exists:

| Relationship | Use when |
| --- | --- |
| **Data or artifact dependency** | The consumer reads an output; prefer this over generic sequencing when the runner can infer execution from dataflow. |
| **Required execution dependency** | Another task must complete successfully even without a direct artifact edge. |
| **Order-only relationship** | Selected work must be ordered but neither task causes the other to be selected. |
| **Lifecycle or aggregate membership** | A no-op intent groups independently useful work. |
| **Continuous or service relationship** | A long-running process must become ready without being treated as a completed prerequisite. |
| **Optional relationship** | Absence or failure is explicitly tolerated by the workflow. |
| **External prerequisite** | A service, permission, approval, or host state is required but not owned by the graph. |

Gradle specifically recommends connecting actionable tasks through inputs and
outputs rather than using coarse `dependsOn` relationships, reserving the
latter primarily for lifecycle tasks.[^gradle-task-practices]

## 5. Cache policy preserves result meaning

A cache replay is a prior result for the computed input identity. It answers
the current question only if execution was deterministic enough, the declared
identity was complete, the stored result is trusted, and the restored evidence
is fit for the caller's purpose. Nx, Turborepo, and Gradle all make cache
correctness depend on accurate task inputs and outputs.[^nx-caching][^turborepo-caching][^gradle-build-cache]

| Task behavior | Default direction |
| --- | --- |
| Deterministic build or verification with complete declared inputs | Cache when outputs are complete and relocatable. |
| Evidence-producing work | Cache only when restored evidence, metadata, and logs remain coherent and answer the caller's question. |
| Observation or measurement, such as a benchmark | Execute when the question concerns current conditions. |
| Aggregate or no-op orchestration | Rely on child-task correctness; do not treat an aggregate cache hit as independent evidence. |
| Interactive, continuous, privileged, or mutating work | Do not cache. |
| Very fast work or work with very large artifacts | Measure whether caching costs more than execution. |

For each cacheable task, establish:

- complete file, dependency, argument, environment, runtime, and toolchain
  inputs;
- complete, non-overlapping, and relocatable outputs;
- repeatability for the same declared identity;
- visible distinction between execution and replay;
- trusted remote-cache readers and writers, artifact integrity, and safe
  treatment of captured logs; Turborepo, for example, offers signed remote
  artifacts and warns that logs are artifacts too;[^turborepo-remote-cache]
- whether cache reads, writes, or both are allowed in each context; and
- whether cache lookup and transfer are economically useful.

Document one runner-native freshness route for each supported observation and
state its scope. `--skip-nx-cache`, Turborepo's `--force`, and Gradle rerun
controls do not have identical read, write, task, and dependency semantics.
Every admitted entrypoint must preserve the selected freshness behavior or
fail loudly.

[^nx-run-tasks]: Nx, *Run Tasks*.
[^nx-task-pipeline]: Nx, *Task pipeline configuration*.
[^nx-caching]: Nx, *How caching works*.
[^turborepo-configuring-tasks]: Turborepo, *Configuring tasks*.
[^turborepo-environment]: Turborepo, *Using environment variables*.
[^turborepo-caching]: Turborepo, *Caching*.
[^turborepo-remote-cache]: Turborepo, *Remote Caching*.
[^gradle-task-practices]: Gradle, *Best Practices for Tasks*.
[^gradle-build-cache]: Gradle, *Build Cache*.
[^bazel-dependencies]: Bazel, *Dependencies*.
[^bazel-hermeticity]: Bazel, *Hermeticity*.
