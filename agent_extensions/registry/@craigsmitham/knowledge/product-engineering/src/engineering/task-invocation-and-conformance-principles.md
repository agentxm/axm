---
type: Guide
title: Task invocation and conformance principles
description: Use when wrappers, aliases, hooks, agents, or CI steps have accumulated around a repository's tasks; the five principles that bound each entrypoint's role, keep one membership authority per workflow, hold actors to canonical semantics, and check resolved rather than declared behavior.
tags:
  [
    repository-task-interface,
    entrypoints,
    wrapper-scripts,
    launcher,
    aliases,
    workflow-inventory,
    agent-harness,
    ci,
    conformance,
    migration-gaps,
    pe-engineering,
  ]
status: draft
sources:
  - id: gradle-organizing-tasks
    resource: https://docs.gradle.org/current/userguide/organizing_tasks.html
    title: Gradle — Organizing Tasks
  - id: gradle-wrapper
    resource: https://docs.gradle.org/current/userguide/gradle_wrapper.html
    title: Gradle Wrapper
  - id: turborepo-running-tasks
    resource: https://turborepo.dev/docs/crafting-your-repository/running-tasks
    title: Turborepo — Running tasks
  - id: nx-conformance
    resource: https://nx.dev/docs/reference/conformance/overview
    title: Nx — Conformance
  - id: moon-tasks
    resource: https://moonrepo.dev/docs/concepts/task
    title: moon — Tasks
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Task invocation and conformance principles

A repository can have well-defined
[resolved task contracts](resolved-task-contract-principles.md) and still be
incoherent, because the paths actors actually use disagree with them. These
five principles bound those paths and say how to check that the resolved
behavior matches the intent described in
[Designing a coherent repository task interface](repository-task-interface.md).

## 6. Every entrypoint has one bounded role

| Entrypoint role | Contract |
| --- | --- |
| **Runner-native task declaration or implementation** | May contain real behavior when the orchestrator consumes it into the resolved contract; direct use is supported only when the local binding says so. |
| **Launcher or bootstrap** | Pins or provisions the orchestrator and forwards its task vocabulary without redefining it. Gradle recommends its checked-in Wrapper for reliable execution across developers and CI.[^gradle-wrapper] |
| **Alias** | Adds only convenience or presentation, preserves one canonical task mapping, and forwards additional arguments unchanged or fails loudly. |
| **Composite or host adapter** | Owns a stable cross-boundary workflow the orchestrator cannot faithfully express; keep it explicit and allowlisted. |
| **Diagnostic invocation** | Runs an underlying tool for investigation and is not represented as supported repository evidence. |

The task implementation can remain a command or a script when that is native
to the orchestrator; moon, for example, supports both forms.[^moon-tasks]
A wrapper that silently injects required behavior above an otherwise
documented task, or a caller that reimplements dependencies and selection, is
a competing interface. The test is semantic duplication, not whether the path
is physically a script.

## 7. Stable workflows have one membership authority

When a workflow means “run this set of work,” its membership has one authored
inventory or one derivation rule. Scripts, hooks, and CI do not maintain copies.

Prefer a graph-native lifecycle or aggregate task when it faithfully preserves
project and affected selection; Gradle recommends lifecycle tasks as accessible
entrypoints for users and CI.[^gradle-organizing-tasks] Otherwise use a single
generated inventory, repository policy, or host-owned definition and make
callers refer to it. The invariant is one authority, not one mandatory storage
mechanism.

## 8. Actors use canonical semantics through supported entrypoints

Agents and CI invoke canonical task identities through the repository's
supported, preferably version-controlled launcher. Turborepo recommends direct
`turbo run` use in CI while also recommending package scripts for frequent
human invocations; both can share the same registered tasks.[^turborepo-running-tasks]

Humans and machines may use different selectors, output modes, or lifecycle
tasks. They must not receive different prerequisites, cache meaning, or result
semantics for the same stated intent. Durable automation does not depend on a
convenience alias whose mapping or argument behavior is undocumented.

When a supported task exists, invoke the underlying CLI directly only for a
clearly identified diagnostic or for work outside the task's contract. Do not
present that result as equivalent repository verification.

## 9. Conformance examines resolved behavior

The guide or local policy owns the reasons; executable checks own stable and
observable rules. Inspect the orchestrator's resolved task model rather than
assuming one source file contains the whole truth. Nx, for example, exposes a
resolved project graph to conformance rules.[^nx-conformance]

Combine structural checks with behavioral contract tests:

- invoke supported tasks from a clean checkout through the pinned launcher;
- verify canonical and admitted convenience paths resolve to the same task;
- verify arguments and freshness controls reach the intended layer;
- change declared file, environment, runtime, and tool inputs and observe
  invalidation;
- restore from cache in another directory or worker and verify every output;
- verify affected selection includes newly added work;
- detect copied workflow inventories and unsupported automation paths; and
- check that failures identify the task or unmet prerequisite.

No static check proves every dependency or environmental assumption. Preserve
unknowns and exceptions rather than treating an incomplete checker as proof of
conformance.

## 10. Boundaries and gaps are explicit

Classify every path outside the canonical task contract:

- A **legitimate boundary** remains with its launcher, host, operational
  system, or diagnostic context and is documented as such.
- A **migration gap** preserves the currently safe path, records why the
  canonical task is incomplete, and names its retirement condition.
- A **duplicate interface** is removed or redirected because it independently
  owns semantics already represented elsewhere.

Do not label intentional tool boundaries as defects. Do not normalize actual
gaps into folklore or add another wrapper around them.

[^gradle-organizing-tasks]: Gradle, *Organizing Tasks*.
[^gradle-wrapper]: Gradle, *Gradle Wrapper*.
[^turborepo-running-tasks]: Turborepo, *Running tasks*.
[^nx-conformance]: Nx, *Conformance*.
[^moon-tasks]: moon, *Tasks*.
