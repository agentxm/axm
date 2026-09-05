---
type: Guide
title: Designing a coherent repository task interface
description: Use when repository tasks, scripts, launchers, wrappers, or CI paths compete, or when placing new repeatable work; design one discoverable resolved task contract that humans, agents, and automation can invoke consistently without forcing every workflow into one tool.
tags:
  [
    repository-task-interface,
    task-contract,
    command-execution,
    task-runner,
    task-graph,
    package-scripts,
    wrapper-scripts,
    build-cache,
    hermetic-builds,
    monorepo,
    developer-experience,
    agent-experience,
    agent-harness,
    ci,
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
  - id: nx-task-pipeline
    resource: https://nx.dev/docs/concepts/task-pipeline-configuration
    title: Nx — Task pipeline configuration
  - id: nx-caching
    resource: https://nx.dev/docs/concepts/how-caching-works
    title: Nx — How caching works
  - id: nx-conformance
    resource: https://nx.dev/docs/reference/conformance/overview
    title: Nx — Conformance
  - id: turborepo-configuring-tasks
    resource: https://turborepo.dev/docs/crafting-your-repository/configuring-tasks
    title: Turborepo — Configuring tasks
  - id: turborepo-running-tasks
    resource: https://turborepo.dev/docs/crafting-your-repository/running-tasks
    title: Turborepo — Running tasks
  - id: turborepo-environment
    resource: https://turborepo.dev/docs/crafting-your-repository/using-environment-variables
    title: Turborepo — Using environment variables
  - id: turborepo-caching
    resource: https://turborepo.dev/docs/crafting-your-repository/caching
    title: Turborepo — Caching
  - id: turborepo-remote-cache
    resource: https://turborepo.dev/docs/core-concepts/remote-caching
    title: Turborepo — Remote Caching
  - id: gradle-organizing-tasks
    resource: https://docs.gradle.org/current/userguide/organizing_tasks.html
    title: Gradle — Organizing Tasks
  - id: gradle-task-practices
    resource: https://docs.gradle.org/current/userguide/best_practices_tasks.html
    title: Gradle — Best Practices for Tasks
  - id: gradle-wrapper
    resource: https://docs.gradle.org/current/userguide/gradle_wrapper.html
    title: Gradle Wrapper
  - id: gradle-build-cache
    resource: https://docs.gradle.org/current/userguide/build_cache.html
    title: Gradle — Build Cache
  - id: bazel-dependencies
    resource: https://bazel.build/concepts/dependencies
    title: Bazel — Dependencies
  - id: bazel-hermeticity
    resource: https://bazel.build/concepts/hermeticity
    title: Bazel — Hermeticity
  - id: pants-goals
    resource: https://www.pantsbuild.org/stable/docs/using-pants/key-concepts/goals
    title: Pants — Goals
  - id: buck2-architecture
    resource: https://buck2.build/docs/concepts/architecture/
    title: Buck2 — Architectural Model
  - id: moon-tasks
    resource: https://moonrepo.dev/docs/concepts/task
    title: moon — Tasks
  - id: just-manual
    resource: https://just.systems/man/en/
    title: Just Programmer's Manual
generated: { by: codex/gpt-5.6, at: 2026-09-02T11:30:27Z }
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

## Principles

### 1. One resolved contract owns each supported intent

Each repeatable unit has one canonical identity and one resolved contract for
what executes, under which prerequisites, with which dependencies, inputs,
outputs, environment, cache behavior, and interpretation of success.

The physical declarations may be composed, inferred, or inherited when the
orchestrator natively supports that model. A package script consumed as an Nx
task or Turborepo task implementation is part of the canonical contract, not
automatically a competing interface.[^nx-run-tasks][^turborepo-configuring-tasks]
What must not happen is for callers to restate or alter semantic behavior
independently.

### 2. Intent and lifecycle determine name and ownership

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

### 3. Supported tasks are self-sufficient within a declared boundary

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

### 4. Dependencies are explicit and typed

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

### 5. Cache policy preserves result meaning

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

### 6. Every entrypoint has one bounded role

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

### 7. Stable workflows have one membership authority

When a workflow means “run this set of work,” its membership has one authored
inventory or one derivation rule. Scripts, hooks, and CI do not maintain copies.

Prefer a graph-native lifecycle or aggregate task when it faithfully preserves
project and affected selection; Gradle recommends lifecycle tasks as accessible
entrypoints for users and CI.[^gradle-organizing-tasks] Otherwise use a single
generated inventory, repository policy, or host-owned definition and make
callers refer to it. The invariant is one authority, not one mandatory storage
mechanism.

### 8. Actors use canonical semantics through supported entrypoints

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

### 9. Conformance examines resolved behavior

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

### 10. Boundaries and gaps are explicit

Classify every path outside the canonical task contract:

- A **legitimate boundary** remains with its launcher, host, operational
  system, or diagnostic context and is documented as such.
- A **migration gap** preserves the currently safe path, records why the
  canonical task is incomplete, and names its retirement condition.
- A **duplicate interface** is removed or redirected because it independently
  owns semantics already represented elsewhere.

Do not label intentional tool boundaries as defects. Do not normalize actual
gaps into folklore or add another wrapper around them.

## Design or repair the interface

1. **Name the actor intents and evidence questions.** List the outcomes people
   and automation need—build, verify, run, release, inspect—and what success
   must establish.
2. **Inventory paths and callers.** Record runner tasks, package scripts,
   launchers, wrappers, hooks, CI steps, underlying-tool commands, and
   documentation. Compare prerequisites, selection, arguments, environment,
   dependencies, caching, outputs, and result meaning.
3. **Mark execution boundaries.** Decide which work the orchestrator can model
   faithfully and which work belongs to bootstrap, a host lifecycle, an
   operational system, or diagnostics.
4. **Assign canonical task identities.** Bind each supported repeatable intent
   to an operation, subject or selection, and resolved contract using the
   runner's native model.
5. **Name and own by outcome.** Choose the narrowest stable semantic owner;
   normalize synonymous verbs and retain qualifiers only when they distinguish
   actor intent.
6. **Make the contract self-sufficient.** Declare prerequisites, environment
   boundaries, dependency types, inputs, outputs, and failure behavior. Move
   caller-side semantic behavior behind the canonical contract.
7. **Set cache and freshness semantics.** Decide what may be replayed, which
   evidence requires current execution, who may populate remote caches, and
   how every entrypoint requests freshness.
8. **Collapse workflow inventories.** Give each stable task set one authored
   inventory or derivation authority while preserving project and affected
   selection.
9. **Bound the entrypoints.** Retain runner-native implementations, launchers,
   necessary aliases, composites, and host adapters only in their declared
   roles. Remove or track duplicate semantics.
10. **Move actors to supported paths.** Update agents, CI, hooks, and durable
    documentation to invoke canonical task identities through supported
    launchers or admitted cross-boundary workflows.
11. **Encode and test the contract.** Check resolved configuration and exercise
    clean-shell, argument, dependency, cache, freshness, portability, affected,
    and failure behavior.
12. **Track evidence and exceptions.** Measure whether the interface improves
    discovery and trust, and retire migration gaps when their conditions are
    met.

## Bind the portable model locally

Keep a short repository policy or executable binding that names:

- the orchestrator and how its native concepts map to operation, subject,
  invocation, and resolved contract;
- the supported version-pinned launcher and bootstrap boundary;
- declared prerequisites, environment provisioning and injection boundaries,
  and supported platforms;
- task vocabulary and semantic owners, including workspace- and host-owned
  work;
- dependency kinds, cache trust policy, freshness controls, and result meaning;
- admitted aliases, composites, host adapters, diagnostic paths, and migration
  exceptions;
- workflow membership authorities; and
- enforcement and behavioral-test locations.

Keep repository-specific syntax and inventories in that binding or executable
configuration, not in portable guidance.

## Verify the outcomes

The official sources establish tool capabilities and design guidance; they do
not guarantee that this interface improves every repository or actor. Observe:

- time and attempts needed to discover the correct task;
- wrong-path invocation and argument-loss rates;
- clean-checkout success across supported environments;
- disagreements between local and CI results;
- incorrect cache hits, incomplete restores, and freshness mistakes;
- authored locations changed when adding or removing workflow membership;
- agent or newcomer escalations caused by ambiguous commands; and
- count, age, and retirement of exceptions.

Use these signals to revise the local binding. Do not infer success merely from
a neat task configuration.

## Worked example

A repository lists its validation work in two package scripts, a Git hook, and
a CI workflow. Adding a check requires four edits, and affected validation can
omit it when the lists drift. A coding agent sees several plausible commands
and cannot determine which one supplies release-candidate evidence.

First resolve how the repository's orchestrator represents validation. In Nx,
the effective task may combine inferred or package-script behavior with task
defaults; in Turborepo, the package script may implement the registered task.
Those runner-native sources can remain as long as they resolve to one contract.

Give validation one membership authority: a faithful graph-native lifecycle
task when available, or one derived inventory otherwise. Make the hook and CI
invoke that identity through the supported launcher instead of listing its
members. If a commit-range security scan cannot be expressed faithfully in the
graph, admit one composite that invokes the canonical validation task and the
host-aware scan. Each child keeps its own dependency, cache, freshness, and
evidence policy.

The technical result is one semantic task contract and one validation
inventory rather than four competing definitions. The valuable result is that
a developer or agent can discover the validation intent, invoke it through a
supported entrypoint, distinguish execution from replay, trust what success
means, and add a future check in one authoritative place.

[^fowler-ci]: Martin Fowler, *Continuous Integration*.
[^build-systems-a-la-carte]: Andrey Mokhov, Neil Mitchell, and Simon Peyton Jones, *Build Systems à la Carte*.
[^nx-run-tasks]: Nx, *Run Tasks*.
[^nx-project-configuration]: Nx, *Project Configuration*.
[^nx-task-pipeline]: Nx, *Task pipeline configuration*.
[^nx-caching]: Nx, *How caching works*.
[^nx-conformance]: Nx, *Conformance*.
[^turborepo-configuring-tasks]: Turborepo, *Configuring tasks*.
[^turborepo-running-tasks]: Turborepo, *Running tasks*.
[^turborepo-environment]: Turborepo, *Using environment variables*.
[^turborepo-caching]: Turborepo, *Caching*.
[^turborepo-remote-cache]: Turborepo, *Remote Caching*.
[^gradle-organizing-tasks]: Gradle, *Organizing Tasks*.
[^gradle-task-practices]: Gradle, *Best Practices for Tasks*.
[^gradle-wrapper]: Gradle, *Gradle Wrapper*.
[^gradle-build-cache]: Gradle, *Build Cache*.
[^bazel-dependencies]: Bazel, *Dependencies*.
[^bazel-hermeticity]: Bazel, *Hermeticity*.
[^pants-goals]: Pants, *Goals*.
[^buck2-architecture]: Buck2, *Architectural Model*.
[^moon-tasks]: moon, *Tasks*.
[^just-manual]: *Just Programmer's Manual*.
