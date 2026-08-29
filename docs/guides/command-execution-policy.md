---
type: Guide
status: stable
description: Local binding of the command execution strategy — AXM's task graph, script surface, prerequisites, shared verbs, and gap tracking.
depends-on:
  - "@craigsmitham/knowledge/software-engineering#command-execution"
---

# Command Execution Policy

This binds the
[Command execution strategy](../../agent_extensions/agentxm/@craigsmitham/knowledge/software-engineering/src/command-execution.md)
to AXM: targets do the work, scripts name workflows, and aliases are pure or do
not exist. The strategy owns the reasoning; this document names only the local
choices.

## Task graph and script surface

Nx is the task graph, configured by `nx.json` and per-project `project.json`;
targets own their command, dependencies, inputs, outputs, and cache policy. The
`package.json` scripts, run with pnpm, are the script surface. Wrapper scripts
live in `scripts/` and are invoked from a target's own command — except
`scripts/with-allure-report.sh`, which is a published workflow name because
generating the Allure report after a _failed_ run cannot be expressed in-graph.
Reach it through `pnpm run ci:report` or `pnpm run verify:affected:report`,
never by path.

## Local prerequisites

The self-sufficiency test (strategy principle 2) assumes exactly two things:

- The toolchain pinned in `mise.toml` — Node.js 22.23.2, pnpm 11.20.0, and Bun
  1.3.14 — installed with `mise install`. `mise.toml` is where the Bun runtime
  is pinned for development, and Bun is a hard prerequisite rather than an
  optional one: several root targets run `bun scripts/<name>.ts` directly.
- `pnpm install` at the repository root.

No env file, running service, or container is needed to invoke a target. The
`container:*` workflows additionally need Docker, and releases are published
from GitHub Actions.

## Shared verbs

`build`, `test`, `lint`, `lint:fix`, `typecheck`, `format`, `format:check`,
`ci`, `verify:affected`, and the `:affected` variants carry the same meaning
here as in the sibling platform repository. AXM adds local names such as
`test:spec`, `test:tooling`, and `verify:artifact`; it does not reuse a shared
verb with a different meaning.

One deliberate divergence: `format` and `format:check` run Prettier over the
whole repository. That is AXM's canonical meaning, documented in
[CONTRIBUTING.md](../../CONTRIBUTING.md); the Nx changed-file form is
`format:affected` / `format:check:affected`.

## Invocation

Agents, CI, and documentation invoke targets
(`pnpm exec nx run <project>:<target>`) for units of work and published workflow
names (`pnpm run ci`, `pnpm run verify:affected`) for workflows; pure aliases
are for interactive convenience only. `--skip-nx-cache` forces real execution —
each shared-verb script is a single Nx invocation, so the flag reaches the
runner, and `test:spec` forwards unrecognized flags to its target. For a
multi-stage published workflow whose stages are joined by `&&` — `ci`,
`verify:clean`, `verify:full`, `verify:affected`, `test:all` — `pnpm` appends
arguments to the last stage only, so the supported form is the env variable
`NX_SKIP_NX_CACHE=true`.

## Gaps and enforcement

No automated check enforces this layering today; review, the
[repository instructions](../../AGENTS.md), and this document uphold it. Track
violations and not-yet-self-sufficient targets as GitHub issues in this
repository. Per strategy principle 9 a gap keeps its current wrapper as the
supported invocation until it is migrated — never a further wrapper layer.
