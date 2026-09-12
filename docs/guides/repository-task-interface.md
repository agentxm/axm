---
type: Guide
status: stable
description: Local binding of the portable repository task-interface contract to AXM's Nx, pnpm, cache, release, and host execution surfaces.
depends-on:
  - ../../agent_extensions/agentxm/@craigsmitham/knowledge/product-engineering/src/engineering/repository-task-interface.md
---

# Repository task interface

The
[portable repository task-interface guide](../../agent_extensions/agentxm/@craigsmitham/knowledge/product-engineering/src/engineering/repository-task-interface.md)
is authoritative for task-interface semantics and conformance criteria. This
document binds that guidance to AXM. It records repository-specific choices,
host boundaries, and temporary gaps; it does not redefine the portable model.
A local deviation is a gap with a retirement condition, not alternative policy.

Resolved Nx configuration and executable checks own current behavior. Root
instructions and contributor guides route here instead of copying this binding.

## Local binding

| Portable role      | AXM binding                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Orchestrator       | Nx                                                                                                       |
| Supported launcher | `pnpm exec nx`; root scripts may use the equivalent `nx` resolved by pnpm                                |
| Operation          | An Nx target such as `build`, `test`, `generate:schemas`, or `verify-source-hygiene`                     |
| Subject            | One project, every project exposing a target, or Nx's affected project set                               |
| Resolved contract  | Nx configuration after plugins, target defaults, project configuration, and package scripts are combined |
| Workflow surface   | Root `package.json` scripts invoked with `pnpm run`                                                      |
| Bootstrap boundary | The toolchain pinned by `mise.toml` and dependencies explicitly installed by pnpm                        |
| Host adapter       | CI, release, container, Git, and external-workspace launchers whose state Nx cannot model faithfully     |
| Diagnostic path    | Direct underlying-CLI invocation used for investigation, not equivalent repository evidence              |

Invoke a unit of work as `pnpm exec nx run <project>:<target>`. Invoke a
published workflow by its root script name. A supported target owns its command,
environment, dependencies, inputs, outputs, cache behavior, and result meaning.

## Prerequisites and platforms

The direct-target baseline is the Node, pnpm, and Bun toolchain pinned by
`mise.toml`, followed by `pnpm install` at the repository root. No environment
file, service, or container is a general prerequisite. The workspace sets
`verifyDepsBeforeRun: error`, so a command with absent or stale dependencies
fails before pnpm can install or partially mutate the checkout.

The source workspace does not advertise an `axm` package bin before the CLI is
built. Its `publishConfig.bin` supplies the compiled executable mapping when
pnpm packs the release package; dependency installation neither builds the CLI
nor links a missing build output. Use the source-CLI launchers for repository
work. Release publication still owns the build and ships the same compiled
entry point.

- Container workflows additionally require Docker.
- Release publication runs in GitHub Actions with repository credentials and
  platform-specific tool setup.
- Windows verification uses the explicit `test-windows`, `e2e-windows`, and
  install-verification targets selected by the host workflow.
- Source-CLI invocation from another workspace is an external-workspace
  launcher and uses the absolute forms documented in
  [Development environment](../../devops/runbooks/run-source-cli.md#run-the-source-cli-against-another-workspace).

## Intent and ownership

| Intent                                                                          | Owner                                         |
| ------------------------------------------------------------------------------- | --------------------------------------------- |
| Build, lint, typecheck, test, generation                                        | The project that owns the sources or artifact |
| Executable specifications for a subject                                         | The project that owns that subject's source   |
| CLI compilation                                                                 | `cli`                                         |
| CLI end-to-end and binary/install verification                                  | `cli-e2e`                                     |
| The specification metadata contract                                             | `specification-metadata`                      |
| Specification discovery, catalog, verdict, selection, and cross-project hygiene | `axm`                                         |
| Repository tooling, release helpers, and reports                                | `axm`                                         |
| Published package membership                                                    | `nx.json` release configuration               |

Aggregate targets such as `generate`, `e2e`, and `install-verification` are
lifecycle nodes: they perform no duplicate check and declare the work they
aggregate through `dependsOn`.

Placement infers the rest. `scripts/placement-tags-plugin.ts` derives a
library's `domain:*` tag from `packages/<domain>/<name>` and rejects a project
that authors the tag or sits outside the layout. `scripts/typecheck-plugin.ts`
attaches a `typecheck` target to every `apps/*`, `packages/*/*`, or `tools/*`
project that has a `tsconfig.spec.json`, and adds a `build` dependency only when
the project declares one, so placement plus a project's own TypeScript
configuration — not a hand-maintained list — decides whether it is type-checked
and against what. The `@nx/vitest` plugin attaches `test` from
`apps/cli`, `packages/**`, and `tools/**` `vitest.config.ts` files, and
`e2e-main` from `apps/cli-e2e`. Adding a project therefore means adding its
configuration files, not registering it in a central target.

There is no central specification project and no application harness. A
specification is a `*.spec.ts` beside the source it specifies, so its owner's
`test` target is the lane that runs it, under the same inputs, cache behavior,
and `^build` dependency as that project's ordinary tests. Boundary is a property
of the specification, not of a separate target: a memory-boundary rule runs in a
library's `test`, and a process, binary, or install-boundary rule lives in
`apps/cli-e2e` and runs in its `e2e` targets against built artifacts. `axm` owns
only the cross-project views over that corpus — `generate:specification-catalog`,
`specification-verdict`, and `verify-source-hygiene` — plus the `test:spec`
selection wrapper, which resolves identities to owners and delegates.

`architecture:check` analyzes the complete source graph of capabilities in
[the native boundary configuration](../../tools/architecture/config.mjs), with
no prerequisite builds. Dependency-cruiser extracts dependencies, JS Boundaries
assigns capability owners, and Graphlib identifies capability cycles that cross
architectural-role folders. Both `verify:affected` and `verify:workspace` run this
global check before their other checks. `architecture:test` uses Node's native
test runner to exercise allowed and forbidden dependencies and the composed root
ESLint configuration, with no build prerequisite; the
existing Nx constraints remain active for unconverted scopes.

Use the confidence ladder consistently. A focused Nx target answers one question
during implementation. `verify:affected` is the fast source-only loop over the
current Nx range. `verify:pr` is the complete change-boundary gate: clean and
format checks, affected source verification, packed artifacts, and affected CLI
E2E. `ci` runs full-workspace source and CLI diagnostics for automation and scheduled
coverage; it is not the routine substitute for `verify:pr`.

`axm:unused-code` uses [Knip](https://knip.dev/features/monorepos-and-workspaces)
to check first-party software for unreachable files, unused or undeclared
dependencies, unresolved imports, and stale catalog entries. Both source
verification workflows run it across the workspace before building. It has no
build prerequisite and runs fresh; an affected-project selection would miss
unused files or dependencies left behind in a provider when a consumer is
removed. Native plugins read package exports, Nx targets, and test configuration.
`knip.jsonc` adds the externally loaded and compiler-only entry points and names
the few dependency exceptions that static analysis cannot establish. Stale
configuration hints fail the check. Acquired Agent Skill packages retain their
own validation boundary.

The gate currently covers files and dependency declarations. Symbol-level
export and member reports remain available through the same target with
`--include=exports,types,duplicates`; review those findings against the published
API before pruning. The compiler and ESLint continue to own unused local
bindings. Knip does not replace architectural dependency or cycle enforcement.

Dependencies express prerequisite artifacts or lifecycle ordering. Callers do
not sequence a dependency already owned by a target. Host workflows may order
steps only where failure handling, credentials, platform setup, or external
state prevents faithful graph representation.

The root `build-test-reporting` target imports the published specification
metadata contract, so it depends explicitly on
`specification-metadata:build`. Clean-checkout verification must not rely on a
previously populated package `dist` directory.

`axm:reconcile-github-release -- <prepare|publish> <tag> <sha>` owns exact draft
GitHub Release creation and final publication with bounded state readback.
`axm:validate-release-cohort -- <directory> <version> <sha>` validates the
fixed npm cohort independently of publication. `axm:publish-bootstrap-prerelease
-- <sha> <workflow-run-id>` owns the exceptional exact-current-main preview
cohort and its immutable npm publication; it is available only through the
canonical workflow's explicit bootstrap mode.

`axm:distribute-release -- <version> <tag> [asset-directory]` owns artifact,
fixed-cohort npm and Homebrew publication. It depends on cohort builds, checks
mutable owners before publication, validates deterministic packs, verifies
immutable reuse and readback, and reports superseded candidates explicitly.
It preflights the complete cohort before the first write, submits each confirmed
absent immutable coordinate once, and observes pending npm and Homebrew state
concurrently under bounded total deadlines. Terminal authorization, metadata,
integrity, and superseded outcomes are not retried. Mutable `latest` repair is
not attempted without separately supplied narrow npm authority.
`axm:update-homebrew-formula -- <version>` consumes the exact local asset set
from `RELEASE_ASSET_DIR` and a tap checkout from `HOMEBREW_TAP_DIR`; a rejected
concurrent push is not retried.

`axm:verify-installed-package -- <npm|pnpm|yarn> <version>` installs the exact
published package in temporary global state and runs its installed executable
outside the repository, without source export conditions or workspace module
resolution. Release automation owns the platform matrix and credentials.
`axm:verify-release-packs` builds and checks the complete candidate cohort in
`verify:pr` and `verify:workspace`. [Publint](https://publint.dev/docs/javascript-api)
validates the exact tarballs with warnings treated as errors, covering package
entries, declaration and module format, conditional exports, and executables.
AXM retains its own fixed-cohort coordinates, dependency closure, compiled CLI
entry, and two-pack determinism checks. The source-only `verify:affected` loop
does not pack artifacts.

Manifest normalization runs through pnpm's `beforePacking` hook after workspace
and catalog references have been resolved. It preserves condition precedence in
exports and imports and removes the workspace-only `axm-source` condition from
the published manifest; no second npm repack is involved.
These targets are uncached because they mutate or observe external state.

The release promotion target consumes the exact validated asset directory and
derives its workspace build prerequisites from the project graph through
`^build`. It starts from a clean candidate checkout after dependency installation;
the workflow does not supply separately built package artifacts. The target
owns public validator preflight before its
conditional update. It checks identity, gzip, Brotli, and Zstandard negotiation
without sending promotion credentials to the public endpoint. Representation
disagreement fails before mutation; a later invocation reads the channel again.
First-channel creation and retaining an already newer channel do not update an
existing object and keep their existing conditional-create and no-op paths.

## Cache, freshness, and evidence

Deterministic tasks may be cached only when their resolved inputs cover every
source, configuration, tool, environment value, and dependency output that can
change the result, and their outputs have one owner. Git-history checks,
benchmarks, release mutations, artifact/download operations, external install
verification, and projection observations run fresh.

The root command tests use the runtime prepared by `axm:test` and pass
`--excludeTaskDependencies` to their nested release-tag and metadata target
invocations. Rebuilding those prerequisites inside a concurrent test wave can
delete `dist` files while another project imports them. The tests disable cache
reuse for the nested invocation and check that the prepared runtime file keeps
its inode and modification time. The standalone targets declare `^build`;
`axm:test` satisfies those prerequisites before the command tests execute.

Cached test outputs are evidence from the execution that originally produced
their task hash. A cache replay is the same input-bound verdict, not a new
execution on the restoring host. Broad verification submits lint, typecheck,
build, test, and repository checks to one Nx graph so graph-owned dependencies
and valid reuse replace manually serialized build phases. Required CLI E2E leaf
targets remain non-cacheable, while their deterministic compiled-artifact
prerequisites may be restored. Main E2E runs as two native Vitest shards plus a
separate binary/install partition with isolated reports.

Each Vitest invocation replaces its suite's Allure results when the reporter
initializes. Allure's native reporter otherwise appends files, which would let Nx
cache results from earlier invocations alongside current tests. Configuration
discovery does not remove results; sibling suites keep their own output ownership.

The `*:report` host workflows start with an empty generated `test-results`
directory. Nx then restores selected cached suite outputs or executes their
targets. [Allure's native `run` command](https://allurereport.org/docs/v3/generate-report/)
collects those outputs, generates the report even when verification fails, and
preserves the command's failure status. Clearing outputs is necessary because
native `run` ignores initially existing files: a cache hit whose outputs are
already present would otherwise produce an empty report. Results from unselected
suites are excluded. This clears generated evidence, not the Nx task cache.
Direct `axm:allure-report` remains a diagnostic view of the results present on
disk; it does not claim a new execution or a complete verification workflow.

`generate:check` reads the resolved project graph once, follows local generator
dependencies, and scopes comparison to their declared outputs, which Nx's own
output interpolation resolves. Ownership stays explicit: a generate target that
declares no `outputs` owns nothing, and a declared output whose tokens do not
resolve fails the check rather than narrowing its scope. It copies the
tracked and nonignored workspace view into a disposable snapshot, regenerates
there, and compares content, executable modes, symlinks, additions, and
deletions without mutating the developer's index or working tree. `sync:check`
separately uses Nx's native synchronization check for Nx-owned synchronization.

Specification evidence records whether runtime code was loaded from `source`
or `built` artifacts. Freshness compares the recorded runtime digest with the
same mode: source executions track their source inputs and built executions
track package `dist` outputs. A source receipt is therefore not invalidated by
irrelevant build artifacts, while neither mode can satisfy evidence recorded
for the other runtime boundary.

For a single Nx invocation, append `--skip-nx-cache`. For a multi-stage root
workflow, set `NX_SKIP_NX_CACHE=true`; pnpm would otherwise forward an appended
flag only to the final stage.

GitHub Actions may restore the repository's lockfile- and revision-scoped Nx
cache. A restored entry is trusted only as a deterministic result for its Nx
hash. Package-store and container-layer caches supply dependencies, not task
verdicts.

When task-level timing is needed for a diagnosed question, set Nx's native
`NX_PROFILE=<file>` trace for that invocation. Routine workflows do not collect
or post-process a profile. Nx 23 does not expose cache lookup time through the
trace, so do not infer it from task duration. A GitHub Actions cache archive hit
remains a separate setup/transport signal and is never counted as a task-cache
hit.

## Entrypoints and host adapters

Root scripts are limited to same-intent aliases, bounded composites, bootstrap
launchers, and host adapters. These boundaries are intentional:

| Boundary                                                              | Reason                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `axm` and `axm:local`                                                 | Launch the source CLI, optionally against an external workspace                                                                 |
| `container:*`                                                         | Create the environment in which the task graph can run                                                                          |
| `classify:ci` and `check:ci-image`                                    | Run before workspace dependencies exist; their host jobs lower `verifyDepsBeforeRun` to `warn` only for these source-only tasks |
| `test:spec`, `verify:artifact`, `verify:release`, `verify:deployment` | Resolve an exact subject, then invoke the target that owns the evidence                                                         |
| `*:report` through `scripts/with-allure-report.sh`                    | Generate evidence even when the preceding gate fails; an Nx dependent would be skipped                                          |
| `lint-staged`                                                         | Operate on the Git index, which Nx affected selection does not represent                                                        |
| release workflow platform steps                                       | Hold credentials, GitHub release state, and platform matrices outside Nx                                                        |

Automation invokes targets directly unless it needs one of these host
semantics. Direct Vitest, TypeScript, ESLint, Prettier, or Bun invocation is not
equivalent evidence when a supported target or workflow exists.

The `axm` and `axm:local` launchers activate Bun's repository-only
`axm-source` export condition. Every publishable runtime workspace-package
export maps that condition to TypeScript under `src`, while its normal
`default` continues to map to JavaScript under `dist`. A source CLI therefore
resolves transitively to source without requiring or trusting ignored build
artifacts; installed and published consumers retain the artifact boundary.

## Workflow membership

- Target presence owns project membership for ordinary `run-many` and affected
  workflows.
- Resolved `dependsOn` owns task ordering.
- `nx.json` release configuration owns published-package membership.
- A bounded root composite owns its stages; callers invoke it rather than copy
  those stages.
- CI owns job topology, platform matrices, credentials, and always-run report
  collection, but not a second repository task graph.

## Gaps

| Gap                                                                          | Current risk                                                              | Retirement condition                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Cached Allure and JUnit results preserve the originating host and timestamps | A restored report can be mistaken for a current execution                 | Reports carry execution and replay provenance, or evidence-producing tasks run fresh                                               |
| Root workflow names overlap (`ci`, `ci:workspace`, `verify:*`, `test:all`)   | Callers must translate among similar gates and their membership can drift | One deterministic repository gate and one affected form own source verification; host workflows compose explicit external evidence |
| Publish workflow repeats the release project list when building and packing  | Release membership has more than one authored copy                        | Build and package selection derive from the `nx.json` release set                                                                  |

## Enforcement

`check:ci-image` verifies the pre-install and container contracts. Repository
tooling tests verify hooks, release helpers, source hygiene, the source export
invariant, explicit dependency preparation, and selected caller relationships.
The uncached `axm:source-cli-smoke` target runs before builds in `verify:clean`,
proving that the source launcher starts without workspace `dist`.
Task-interface conformance additionally inspects the resolved Nx graph and
exercises clean-checkout invocation, argument and freshness forwarding, cache
invalidation and restoration, output ownership, affected selection, host
boundaries, and report provenance.

Changes to `package.json`, `nx.json`, project targets, wrappers, hooks, or
automation must update the binding and its executable conformance evidence in
the same change.
