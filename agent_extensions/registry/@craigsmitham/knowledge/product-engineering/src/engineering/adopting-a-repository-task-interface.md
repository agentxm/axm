---
type: Guide
title: Adopting a repository task interface
description: Use when converting the task-interface principles into an actual repository change; a twelve-step design or repair sequence, the local binding that records runner-specific decisions, the signals that show whether the interface helped, and a worked example of collapsing four validation inventories into one.
tags:
  [
    repository-task-interface,
    adoption,
    migration,
    task-inventory,
    repository-policy,
    developer-experience,
    agent-experience,
    ci,
    worked-example,
    pe-engineering,
  ]
status: draft
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Adopting a repository task interface

This guide turns the model in [Designing a coherent repository task
interface](repository-task-interface.md) and its principles for
[resolved contracts](resolved-task-contract-principles.md) and
[invocation and conformance](task-invocation-and-conformance-principles.md)
into a change a repository can actually make. Use it when the diagnosis is
already done and the question is what to do next, in what order, and how to
tell whether it worked.

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

## Apply the example to a product change

In [Northbank's engineering-system episode](northbank-engineering-system.md),
one copied CI inventory omits a new allocation-concurrency check. The worked
change resolves membership, shows an intentional failure propagating through
the supported workflow, and distinguishes source validation, artifact build,
migration rehearsal, and current deployed assessment. Use that case to follow
the contract into CI/CD and infrastructure while keeping orchestration separate
from each task's meaning.
