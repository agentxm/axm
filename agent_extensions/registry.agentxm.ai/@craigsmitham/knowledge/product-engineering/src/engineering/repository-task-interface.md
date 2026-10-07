---
type: Guide
title: Designing a coherent repository task interface
description: Use when repository tasks, scripts, launchers, wrappers, or CI paths compete, or when placing new repeatable work; name the competing-semantics problem, the outcomes one task interface must deliver, and the portable vocabulary that the contract, invocation, and adoption guides build on.
tags:
  [
    repository-task-interface,
    task-contract,
    command-execution,
    task-runner,
    task-graph,
    package-scripts,
    wrapper-scripts,
    monorepo,
    developer-experience,
    agent-experience,
    agent-harness,
    ci,
    pe-engineering,
  ]
status: draft
sources:
  - id: fowler-ci
    resource: https://www.martinfowler.com/articles/continuousIntegration.html
    title: Continuous Integration
  - id: build-systems-a-la-carte
    resource: https://simon.peytonjones.org/assets/pdfs/build-systems-original.pdf
    title: Build Systems à la Carte
  - id: nx-run-tasks
    resource: https://nx.dev/docs/features/run-tasks
    title: Nx — Run Tasks
  - id: nx-project-configuration
    resource: https://nx.dev/docs/reference/project-configuration
    title: Nx — Project Configuration
  - id: turborepo-configuring-tasks
    resource: https://turborepo.dev/docs/crafting-your-repository/configuring-tasks
    title: Turborepo — Configuring tasks
  - id: pants-goals
    resource: https://www.pantsbuild.org/stable/docs/using-pants/key-concepts/goals
    title: Pants — Goals
  - id: buck2-architecture
    resource: https://buck2.build/docs/concepts/architecture/
    title: Buck2 — Architectural Model
  - id: just-manual
    resource: https://just.systems/man/en/
    title: Just Programmer's Manual
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Designing a coherent repository task interface

A repository task interface sits between an actor's intent and the
repository's behavior. A developer, coding agent, Git hook, or CI job should be
able to express “build this,” “verify that,” or “run the application” without
first reconstructing which script, task, target, wrapper, or CI-only command is
the real one. Mature build guidance similarly aims for a clean checkout and a
single command that lets the build system determine the work required.[^fowler-ci]

Several physical paths can be legitimate. Nx composes resolved tasks from
package scripts, plugin inference, workspace defaults, and project
configuration; Turborepo registers task metadata in `turbo.json` while package
scripts supply task commands.[^nx-project-configuration][^turborepo-configuring-tasks]
The problem is therefore not multiplicity by itself. It is **competing
semantics**: paths that disagree about the requested work, prerequisites,
selection, environment, arguments, caching, outputs, or meaning of success.

This guide helps replace that ambiguity with one coherent task interface. Its
aim is to **make repository work easy to discover, safe to invoke, and
trustworthy to interpret for every human and machine actor, while allowing the
execution system to evolve without multiplying coordination costs.**

## Applicability and boundaries

Use this guide when a repository has an orchestrator capable of modeling the
work, or when competing execution paths indicate that such a contract is
needed. Bind its portable concepts to the repository's actual runner: build
systems differ in dependency discovery, task ordering, rebuild decisions,
hermeticity, and support for dynamic work.[^build-systems-a-la-carte]

Do not force all automation into one graph merely for visual uniformity:

- A small repository can have a coherent command interface without caching or
  a build graph; `just`, for example, deliberately identifies as a command
  runner rather than a build system.[^just-manual]
- Toolchain bootstrap and version selection happen before the orchestrator can
  run.
- A CI platform, release service, Git hook host, or deployment platform can own
  lifecycle work outside the repository graph.
- Privileged mutations, external approvals, and environment-wide operations
  can belong to an operational system whose state the task runner cannot model.
- Direct underlying-tool invocations can be legitimate diagnostics without
  becoming supported repository evidence.

The portable requirement is a clear semantic owner and supported entrypoint
for each intent, plus explicit boundaries where another mechanism owns the
work.

## Desired outcomes

Task graphs, resolved contracts, and bounded entrypoints are means to these
outcomes:

| Outcome | What it gives the repository's actors |
| --- | --- |
| **Fast orientation** | A newcomer or agent can discover how to build, verify, run, or change something without learning repository folklore. |
| **Low cognitive translation** | An actor expresses intent once instead of translating among scripts, targets, wrappers, and CI-only conventions. |
| **Predictable behavior** | A familiar task means the same thing across projects and supported invocation contexts. |
| **Trustworthy feedback** | Success provides the evidence the actor believes it provides; prerequisites, caching, and generated outputs do not create false confidence. |
| **Safe autonomy** | Agents and automation can select and execute supported work without reconstructing hidden conventions or asking which path is real. |
| **Useful failure** | A failed task identifies the work or prerequisite that failed instead of leaving the actor to diagnose an ambiguous invocation path. |
| **Shared semantics** | Humans, agents, hooks, and CI can use different selectors or presentation while relying on the same task meaning. |
| **Sustained flow** | Less searching, retrying, and second-guessing leaves more attention for the product problem. |
| **Change leverage** | Changing a unit of work once improves every caller instead of requiring several command surfaces to be synchronized. |
| **Organizational memory** | The repository preserves how work is performed, reducing dependence on particular maintainers. |

Treat these as outcomes to verify, not benefits guaranteed by adopting a tidy
configuration. The interface succeeds when it shortens the path from “I want
this outcome” to “I know what to invoke and can trust what happened.”

## Symptoms this guide resolves

- Two or more paths claim the same intent but drift independently.
- A runner flag works through one path and is silently swallowed by another.
- A developer requests fresh execution and unknowingly receives replayed
  output.
- A task only behaves correctly when invoked through an undocumented wrapper.
- Agent instructions or CI pipelines must encode repository folklore about
  which plausible command is safe.
- The same validation or release inventory is copied into scripts, hooks, and
  CI.
- An operation is named for its implementation tool rather than actor intent.
- Wrapper scripts wrap wrapper scripts to compensate for unclear ownership.

## Portable model

| Role | Meaning | Runner-specific examples |
| --- | --- | --- |
| **Task interface** | The supported vocabulary and entrypoints through which actors request and interpret repository work | Documented task identities, selectors, launchers, and admitted workflows |
| **Operation** | The action an actor requests | Build, test, lint, deploy, inspect |
| **Subject or selection** | The repository capability or set to which the operation applies | Nx project, Bazel label, Pants address, affected package set |
| **Task invocation** | An operation bound to a subject, configuration, and options | `nx run app:test`, `bazel test //app/...`, `pants test app::` |
| **Resolved task contract** | The effective action, prerequisites, dependencies, inputs, outputs, environment contract, cache policy, and result meaning for one task identity | Nx resolved project configuration; a Turborepo task plus its package script |
| **Orchestrator** | A runner that constructs and executes task or action relationships | Nx, Turborepo, Bazel, Buck2, Gradle, Pants, moon, make |
| **Entrypoint or launcher** | The supported path that selects or provisions the orchestrator without redefining task semantics | `./gradlew`, Bazelisk, a package-manager command invoking the pinned runner |
| **Task implementation** | Code or configuration that performs the work behind the resolved contract | Executor, rule, package script, plugin, bounded program |
| **Alias** | A convenience invocation that adds no semantic behavior | A short interactive name for one canonical task selection |
| **Composite or adapter** | An explicit workflow spanning work one orchestrator invocation cannot faithfully express | A graph check plus a host-owned commit-range scan |
| **Host-owned workflow** | Work whose authoritative state or lifecycle belongs to another system | CI approval, deployment promotion, credential issuance |
| **Underlying CLI** | A tool a task implementation ultimately drives | Test runner, compiler, linter, bundler |

Do not impose one tool's nouns on another. Nx defines named project tasks,
Pants exposes goals over target addresses, and Bazel and Buck2 use targets for
buildable entities whose operation is supplied separately.[^nx-run-tasks][^pants-goals][^buck2-architecture]
A repository binding should use its runner's native terminology while
preserving the distinctions above.

## Route to the principles and the procedure

The rest of the guidance is published as three companion concepts:

- [Resolved task contract principles](resolved-task-contract-principles.md)
  defines what a single task means: canonical ownership, intent-based naming,
  self-sufficiency, typed dependencies, and cache policy that preserves result
  meaning.
- [Task invocation and conformance principles](task-invocation-and-conformance-principles.md)
  bounds the paths actors use: entrypoint roles, workflow membership
  authority, canonical semantics for agents and CI, resolved-behavior
  conformance checks, and explicit boundaries and migration gaps.
- [Adopting a repository task interface](adopting-a-repository-task-interface.md)
  supplies the twelve-step design or repair sequence, the local binding, the
  outcome signals to observe, and a worked example.

[^fowler-ci]: Martin Fowler, *Continuous Integration*.
[^build-systems-a-la-carte]: Andrey Mokhov, Neil Mitchell, and Simon Peyton Jones, *Build Systems à la Carte*.
[^nx-run-tasks]: Nx, *Run Tasks*.
[^nx-project-configuration]: Nx, *Project Configuration*.
[^turborepo-configuring-tasks]: Turborepo, *Configuring tasks*.
[^pants-goals]: Pants, *Goals*.
[^buck2-architecture]: Buck2, *Architectural Model*.
[^just-manual]: *Just Programmer's Manual*.
