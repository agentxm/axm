---
type: Guide
title: Command execution strategy
description: Use when a repository's task runner, package-script surface, and wrapper scripts have accreted into competing invocation paths, or when deciding where a new unit of work belongs; establishes a task-graph-canonical layering with deliberate caching and a bounded script surface that humans, agents, and CI can share.
tags:
  [
    command-execution,
    task-runner,
    task-graph,
    package-scripts,
    npm-scripts,
    wrapper-scripts,
    build-cache,
    monorepo,
    developer-experience,
    agent-harness,
    ci,
  ]
status: stable
generated: { by: claude/opus-5, at: 2026-08-29T20:30:46Z }
---

# Command execution strategy

Most repositories accumulate three ways to run the same work: a task runner
that models the dependency graph (Nx, Turborepo, Bazel, Gradle, make), a
package-script surface that names things for humans (`package.json` scripts, a
justfile, phony make targets), and wrapper scripts that add logic the other
two lack. Without a deliberate strategy the three drift into a second,
hand-maintained task graph layered over the real one — and the layers disagree
about caching, argument forwarding, environment, and sequencing.

This guide defines a layering that stays coherent as the repository grows and
that humans, coding agents, and CI can share. The whole strategy in one
sentence: **targets do the work, scripts name workflows, and aliases are pure
or don't exist.**

## Symptoms this guide resolves

- Two or more names for the same unit of work, drifting independently.
- A runner flag (force execution, verbosity, output style) that works from one
  invocation path and is silently swallowed by another.
- A developer re-running tests and getting a cache replay when they wanted to
  watch real execution — with no obvious way to force it.
- A target that only behaves correctly when invoked through a particular
  script, because environment wiring lives in the script rather than the
  target.
- Agent instructions or CI pipelines that must be told "always use the
  scripts" because direct target invocation is unsafe.
- Wrapper scripts wrapping wrapper scripts to compensate for any of the above.

## Vocabulary

| Role               | Meaning                                                                                        | Examples                                            |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Task graph**     | The tool that models units of work, their dependencies, inputs, outputs, and cache             | Nx, Turborepo, Bazel, Gradle, make                  |
| **Target**         | One unit of work in the task graph                                                             | `nx run app:test`, a Gradle task, a Bazel rule      |
| **Script surface** | The flat, human-facing name registry above the graph                                           | `package.json` scripts, a justfile, phony targets   |
| **Wrapper script** | A program a script or target invokes that adds real logic                                      | a deploy orchestrator, an env loader, a test picker |
| **Underlying CLI** | The tool a target ultimately drives                                                            | vitest, tsc, eslint, a bundler                      |

## Principles

### 1. Targets are the canonical unit of work

Every buildable, testable, or runnable unit is a target in the task graph. The
target — not any script that calls it — owns its command, environment wiring,
sequencing (declared dependencies), declared outputs, and cache policy. The
task graph is the single place where "what runs, in what order, with what
inputs" is answered.

### 2. Targets are self-sufficient

Invoking a target directly produces correct behavior from a clean shell with
only the repository's declared prerequisites in place (an env file, a running
container — whatever the repository names as setup). A target that needs
environment acquisition or preparation invokes that wrapper from its own
command. The requirement never lives only in a script above the target,
because every consumer that bypasses the script then invokes a broken target.

This is the load-bearing principle: it is what makes direct invocation safe
for agents and CI, and every other principle assumes it.

### 3. Cache intent is a deliberate per-target decision

Caching answers "would this pass?" — the verification question. It does not
answer "execute this now and show me" — the observation question. Decide which
question each target serves:

| Target class                                        | Cache policy                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Verification (build, test, lint, typecheck)         | Cached                                                                                                     |
| Evidence-producing (test reports, benchmarks)       | Cached with declared outputs so restores are coherent; consumers depend on them in-graph, not via shell `&&` |
| Interactive or mutating (serve, migrate, deploy)    | Not cached                                                                                                 |

The runner's standard force-execution flag (for example `--skip-nx-cache`,
`--force`) is the single supported way to demand real execution, and every
invocation path must let it reach the runner. If forcing execution requires
knowing which wrapper to avoid, the layering is broken.

### 4. A script is one of exactly two things

The script surface holds:

- **Published workflow names** — stable entry points for sequences that span
  multiple graph invocations or non-graph steps: `ci`, `verify`, `deploy`,
  environment sync. These are the interface for humans and CI pipelines, and
  their names are part of the repository's contract.
- **Pure aliases** — a shorter name for exactly one target, adding no
  environment, no flags, no logic, forwarding arguments untouched.

Nothing else qualifies. A script that exists to inject environment a target
needs is a violation of principle 2 wearing a convenience costume.

### 5. Rename or add capability — never both

Pure aliases rename and add nothing. Wrapper scripts add real logic (target
selection, budget checks, orchestration) and keep the underlying tools' flags
usable: they forward unrecognized arguments or fail loudly, and they never
silently reinterpret them. A script that both renames and adds capability
creates an invocation path whose behavior can't be predicted from either the
name or the wrapped tool.

### 6. Machines invoke the canonical form

Agents and CI use the task graph directly for units of work and published
workflow names for workflows. Pure aliases exist for interactive human
convenience only; instructions, documentation, and pipelines never depend on
them. This keeps the full flag vocabulary of the runner available to
automation and makes the script surface freely prunable.

### 7. Shared verbs mean the same thing everywhere

Across sibling repositories, the top-level vocabulary — `build`, `test`,
`lint`, `typecheck`, `format`, `ci`, `verify`, and their variants — carries
identical semantics. A repository may add local names; it may not reuse a
shared verb with different meaning. A developer or agent moving between
repositories should never have to relearn what `format` does.

### 8. Underlying CLIs stay behind targets

When a target or published workflow exists for a task, direct invocation of
the underlying tool is unsupported for humans and agents alike. Bypassing the
graph bypasses its dependency ordering, environment wiring, and cache
bookkeeping, and produces results the graph doesn't know about.

### 9. Gaps are defects, not conventions

A target that is not yet self-sufficient keeps its wrapper as the supported
invocation until it is migrated — and the gap is tracked as a defect against
the strategy, not compensated for with additional wrapper layers. Wrappers
compensating for wrappers is how the second task graph grows back.

## Adopting this strategy in a repository

The strategy binds to a repository through a thin local policy that names:

- the chosen task graph and script-surface tools;
- the declared local prerequisites for the self-sufficiency test;
- the shared verb vocabulary and any sibling repositories it spans;
- where gaps are tracked and which checks enforce the layering.

Keep that binding document short — the reasoning lives here; the local policy
owns only the choices. Agent instruction files and CI pipelines then reference
targets and published workflow names, never aliases.

## Worked example

A repository has a cached `specifications:test` target, a shell wrapper that
deletes stale report output and regenerates a report after tests, and a
selection script that parses its own arguments before delegating to the
runner. A developer asks for "run the spec tests and show me the report" and
gets a cache replay; passing the runner's force-execution flag fails because
the selection script reinterprets it as a test selector.

Under this strategy: the report becomes a target depending on the test target
(principle 1), with declared outputs so cache restores stay coherent
(principle 3); the shell wrapper is deleted because the graph now owns the
sequencing; the selection script either forwards unrecognized flags to the
runner or moves behind a target (principle 5). The developer's request becomes
one invocation of the report target, and one standard flag forces real
execution through the only path that exists.
