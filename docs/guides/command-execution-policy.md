---
type: Guide
status: stable
description: Local binding of the command execution strategy — AXM's task graph, script surface, prerequisites, shared verbs, named exceptions, and gap handling.
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
`package.json` scripts, run with pnpm, are the script surface.

### Where a wrapper script belongs

Wrapper scripts live in `scripts/`. One rule places each of them, and it is the
question "is this a unit of work, or a workflow?":

- **A wrapper that performs a unit of work gets an Nx target** and is invoked
  through it, never from the script surface directly. A unit of work has an
  input set and produces a result or evidence, so it must be able to declare
  inputs and outputs, carry a cache policy, participate in `nx affected`, and
  be depended on. Benchmarks and contract checks that run after `pnpm install`
  are units of work. A check that must run _before_ there is a `node_modules`
  cannot reach a target at all, and so is not one.
- **A wrapper that only names a workflow stays a published workflow name** on
  the script surface, invoked by name and never by path. A workflow sequences
  several graph invocations or non-graph steps, or is a host-environment entry
  point that exists precisely to run outside the graph — the `container:*`
  launchers and the local CLI runners (`axm`, `axm:local`, `axm:link*`). It
  also covers a wrapper whose own work is resolving the subject an existing
  target then acts on: `test:spec` (with the `test:compatibility` and
  `test:performance` selections built on it) selects specifications and invokes
  `specifications:test`; `verify:artifact`, `verify:release`, and
  `verify:deployment` identify one artifact, release candidate, or install
  endpoint and then invoke `cli-e2e:binary-smoke-artifact`,
  `axm:validate-release-tag` plus `ci`, and `cli-e2e:install-verification`.
  Giving any of those a target would spawn Nx from inside Nx — the shape this
  policy removed from `cli-e2e:install-verification` — so the target each one
  reaches is the unit of work, and the wrapper is not.

There is no third category. A wrapper that is a unit of work but has no target
is a gap to close, not a convention: the deliberate departures that survive are
listed under [Named exceptions](#named-exceptions), and the gaps still open are
listed under [Gaps and enforcement](#gaps-and-enforcement).

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
`ci`, and the `:affected` variants carry the same meaning here as in the
sibling platform repository, as does the source-verification family of
`verify:*` below. AXM adds local names such as `test:spec`, `test:tooling`, and
`verify:artifact`; it does not reuse a shared verb with a different meaning.

`test` reports every failing project rather than stopping at the first one, in
both repositories. The gates — `ci`, `ci:workspace`, and the
source-verification `verify:*` names — stop at the first failure instead,
because their answer is a verdict rather than a survey. `test:e2e` keeps
`--nxBail` on that reasoning: it is the closing phase of the `ci` gate and of
`verify:full`, so it inherits the gate's semantics rather than `test`'s.

One deliberate divergence inside AXM: `format` and `format:check` run Prettier
over the whole repository. That is AXM's canonical meaning, documented in
[CONTRIBUTING.md](../../CONTRIBUTING.md); the Nx changed-file form is
`format:affected` / `format:check:affected`.

### The `verify:*` namespace

`verify:` names a gate that answers "would this pass?" about a stated subject.
The suffix names the subject, and AXM uses the prefix for two families.

**Source verification** — the subject is the workspace as checked out:

| Name               | Subject                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `verify:clean`     | Repository state that must hold before any project runs: CI image contract, generated-artifact drift, Nx sync |
| `verify:workspace` | Every project: lint, typecheck, source hygiene, parity ledger, build, tests                                   |
| `verify:affected`  | The same phases over Nx's affected set, plus the end-to-end suite                                             |
| `verify:full`      | `verify:workspace` plus the end-to-end suite                                                                  |

These four names are shared with the sibling platform repository. The subject
and the verdict are the same in both; the phases each repository composes into
them are local, because the two hold different kinds of project.

**Subject verification** — the subject is one identified artifact or endpoint,
named by an argument, and the name is local to AXM:

| Name                | Subject               |
| ------------------- | --------------------- |
| `verify:artifact`   | One built binary      |
| `verify:release`    | One release candidate |
| `verify:deployment` | One install endpoint  |

A new `verify:<suffix>` declares which family it joins before it is added. A
source-verification suffix is shared vocabulary: it carries the same name and
meaning in both repositories, or it takes a different prefix. A
subject-verification suffix names its subject and takes that subject's identity
as an argument — including a deployed environment, should a name for one be
added here.

`*:report` is a variant suffix rather than a family: `verify:affected:report`
runs `verify:affected` and generates the Allure report whether or not it
passed.

### Divergence from the sibling platform repository

Recorded because both repositories publish `ci` as a shared verb:

- **`ci` coverage.** `pnpm run ci` here ends with the end-to-end suite. The
  same verb in the sibling platform repository stops at unit tests: its
  end-to-end suite requires infrastructure its container CI job does not
  provide. The verb means the same thing in both — the repository's full local
  gate — but a green `ci` in each does not amount to equivalent end-to-end
  evidence, and a change that spans both repositories still needs that suite
  run where it lives.

## Invocation

Agents, CI, and documentation invoke targets
(`pnpm exec nx run <project>:<target>`) for units of work and published workflow
names (`pnpm run ci`, `pnpm run verify:affected`) for workflows; pure aliases
are for interactive convenience only. `--skip-nx-cache` forces real execution —
a shared-verb script that is a single Nx invocation passes the flag through to
the runner, and `test:spec` forwards unrecognized flags to its target. `format`
and `format:check` are the exception: they run Prettier directly, the
divergence recorded above, so an appended flag arrives as another file pattern
rather than at any runner. For a multi-stage published workflow whose stages
are joined by `&&` — `ci`, `ci:workspace`, `verify:clean`, `verify:workspace`,
`verify:affected`, `verify:full`, `test:all` — `pnpm` appends arguments to the
last stage only, so the supported form is the env variable
`NX_SKIP_NX_CACHE=true`.

## Named exceptions

Every deliberate departure from the strategy is listed here. Where the file
format allows a comment, the departure also names this policy at its own call
site — the pattern `scripts/with-allure-report.sh` uses. JSON surfaces
(`package.json`, `project.json`) cannot carry one, so for those this list is
the only record.

- **`scripts/with-allure-report.sh` is a published workflow name rather than a
  target** (principle 4). Generating the Allure report after a _failed_ run
  cannot be expressed in-graph: Nx will not run a dependent target once its
  dependency fails, which is exactly the case CI most needs evidence for. Reach
  it through `ci:report`, `ci:workspace:report`, `verify:affected:report`, or
  `test:e2e:report` — never by path.
- **`lint-staged` invokes `eslint` and `prettier` directly** (principle 8). Its
  selection is the Git index, which the graph cannot express, and the
  pre-commit hook must stay proportional to the staged change rather than to
  the project. Its configuration in `package.json` must stay in parity with the
  sibling platform repository's: when the two drift, a commit the hook
  formatted in one repository is one `format:check` rejects in the other.
  Change both together, including the file-extension globs. The two glob sets
  are currently identical, which is what dropped `jsonc` from the Prettier glob
  here: extensions enter and leave the pair together, and whole-repo
  `format:check` still covers every extension the hook does not select.
- **`build` and `build:affected` add `--batch`** (principles 4 and 5: a script
  is a published workflow name or a pure alias, and an alias that adds a flag
  is neither). Nx accepts batch mode only as the `--batch` flag or the
  `NX_BATCH_MODE=true` environment variable — neither `nx.json` nor a target's
  configuration has a key for it, and `@nx/js:tsc` does not set `preferBatch`,
  so a bare `nx run <project>:build` never batches. Keeping it on the scripts
  and on the `verify:*` gates is the deliberate choice: as ambient environment
  it would silently change how a single-target invocation runs. Batching is
  therefore a property of those two scripts, not of the `build` target;
  `pnpm exec nx run <project>:build` and the release workflow build unbatched.
  The difference is how many compiler processes run, not which compiler.
- **`axm:parity-ledger-check` is `cache: false`** (principle 3). Its input is
  Git history — the seeded exemption-row count at the merge base with
  `origin/main` — not a hashable file set, so a cache entry would replay a
  verdict about a base that has since moved. Do not give it `inputs` and flip
  it to cached; the correct fix for slowness there is a cheaper comparison, not
  a cached history-dependent verdict.
- **`axm:lint-bundled-skill` is `cache: false`** (principle 3). Its verdict
  depends on gitignored `.axm/` projection state as well as on the authored
  `skills/axm/**` sources, and Nx cannot hash the ignored half — so a cached
  pass could hide projection drift. The check is cheap; leave it uncached
  rather than declaring inputs that do not cover what it reads.
- **`axm:bench` is `cache: false`** (principle 3). A replayed benchmark is not
  a measurement. The target exists so the run is reachable by name and can
  declare its dependencies, not so a number can be restored from a cache entry.
- **CI container jobs invoke `scripts/container-environment.sh` by path**
  (principle 6). Those jobs install no host toolchain by design, so there is no
  `pnpm` to resolve `container:ci` with. Wherever a toolchain is present —
  locally, and in
  [Development Environment](../../contributing/guides/development-environment.md)
  — the published `container:*` name is the supported form.
- **`check:ci-image` and `classify:ci` stay on the script surface with no
  target** (principle 4). Both run in CI jobs configured with `install: "false"`
  (`.github/workflows/ci-image.yml` and the `classify` job in
  `.github/workflows/ci.yml`), because both answer a question about the checkout
  itself and must answer it before workspace dependencies exist. With no
  `node_modules` there is no `nx` to reach a target with, which is the same
  reasoning the container launchers carry. They read repository files only and
  need nothing but the pinned Node and Bun runtimes.
- **The source CLI is reached by absolute path from outside the checkout**
  (principle 6). `pnpm run axm:local` and `pnpm axm` are the supported forms
  wherever the shell is inside this repository. From another workspace there is
  no `pnpm` that resolves those names against this `package.json`, so
  `/path/to/axm/scripts/axm-local -C <workspace>` and
  `bun /path/to/axm/packages/cli/src/main.ts -C <workspace>` are the supported
  invocations — the same host-entry-point reasoning as the container launchers.
  [Development Environment](../../contributing/guides/development-environment.md#run-the-source-cli-against-another-workspace)
  documents them; nothing inside the repository may use the path form.
- **Release install verification pins its own Node and Bun versions** (local
  prerequisites). The shared workspace setup action cannot run on that job's
  Windows matrix legs, so `.github/workflows/publish.yml` sets the versions
  inline instead of resolving them from `mise.toml`. They are duplicates, not
  independent pins: `check:ci-image` fails the build if they drift from
  `mise.toml`, so change both together.

## Gaps and enforcement

Review, the [repository instructions](../../AGENTS.md), and this document
uphold most of this layering. Two parts of it are enforced mechanically, both
by `check:ci-image` — reached from `verify:clean`, so every `ci` run covers
them: no workflow may invoke that checker by its script path instead of its
published name, and the one job that duplicates `mise.toml`'s toolchain
versions must duplicate them exactly.

A departure that is not recorded under [Named exceptions](#named-exceptions) is
a defect to fix, not a convention to keep. Per strategy principle 9 a gap keeps
its current wrapper as the supported invocation until it is migrated — never a
further wrapper layer.

The gap ledger below holds wrappers that are units of work under
[the placement rule](#where-a-wrapper-script-belongs) and still run from the
script surface with no target, so they cannot declare inputs or outputs, cache,
or be reached by `nx affected`. It is not a permitted category: closing a row
means adding its target and deleting the row in the same change, and a row is
added only when the gap cannot be closed in the change that creates it. Only a
wrapper a target could actually absorb belongs here — a wrapper that runs
before `pnpm install` or that only resolves a subject for an existing target is
placed by the rule, not owed one, and any deliberate departure it carries is
recorded under [Named exceptions](#named-exceptions) instead.

**The ledger is currently empty.**
