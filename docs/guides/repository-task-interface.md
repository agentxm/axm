---
type: Guide
status: stable
description: Local binding of the portable repository task-interface contract to AXM's Nx, pnpm, cache, release, and host execution surfaces.
depends-on:
  - ../../agent_extensions/agentxm/@craigsmitham/knowledge/software-engineering/src/repository-task-interface.md
---

# Repository task interface

The
[portable repository task-interface guide](../../agent_extensions/agentxm/@craigsmitham/knowledge/software-engineering/src/repository-task-interface.md)
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
  [Development environment](../../contributing/guides/development-environment.md#run-the-source-cli-against-another-workspace).

## Intent and ownership

| Intent                                                                  | Owner                                         |
| ----------------------------------------------------------------------- | --------------------------------------------- |
| Build, lint, typecheck, test, generation                                | The project that owns the sources or artifact |
| CLI compilation                                                         | `cli`                                         |
| CLI end-to-end and binary/install verification                          | `cli-e2e`                                     |
| Executable product specifications                                       | `specifications`                              |
| Repository tooling, release helpers, reports, and cross-project hygiene | `axm`                                         |
| Published package membership                                            | `nx.json` release configuration               |

Aggregate targets such as `generate`, `e2e`, and `install-verification` are
lifecycle nodes: they perform no duplicate check and declare the work they
aggregate through `dependsOn`.

Dependencies express prerequisite artifacts or lifecycle ordering. Callers do
not sequence a dependency already owned by a target. Host workflows may order
steps only where failure handling, credentials, platform setup, or external
state prevents faithful graph representation.

`axm:distribute-release -- <version> <tag> [asset-directory]` owns artifact,
fixed-cohort npm and Homebrew publication. It depends on cohort builds, checks
mutable owners before publication, validates deterministic packs, verifies
immutable reuse and readback, and reports superseded candidates explicitly.
`axm:update-homebrew-formula -- <version>` consumes the exact local asset set
from `RELEASE_ASSET_DIR` and a tap checkout from `HOMEBREW_TAP_DIR`; a rejected
concurrent push is not retried.

`axm:verify-installed-package -- <npm|pnpm|yarn> <version>` installs the exact
published package in temporary global state and runs its installed executable
outside the repository, without source export conditions or workspace module
resolution. Release automation owns the platform matrix and credentials.
`axm:verify-release-packs` builds and checks the complete candidate cohort,
including deterministic repacking, compiled executables and dependency closure.
These targets are uncached because they mutate or observe external state.

The release promotion target consumes the exact validated asset directory and
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

Cached test outputs are evidence from the execution that originally produced
their task hash. A cache replay is the same input-bound verdict, not a new
execution on the restoring host. Required main-branch E2E evidence sets
`NX_SKIP_NX_CACHE=true`; reports that may contain restored results must disclose
that result meaning until per-result provenance is available.

For a single Nx invocation, append `--skip-nx-cache`. For a multi-stage root
workflow, set `NX_SKIP_NX_CACHE=true`; pnpm would otherwise forward an appended
flag only to the final stage.

GitHub Actions may restore the repository's lockfile- and revision-scoped Nx
cache. A restored entry is trusted only as a deterministic result for its Nx
hash. Package-store and container-layer caches supply dependencies, not task
verdicts.

## Entrypoints and host adapters

Root scripts are limited to same-intent aliases, bounded composites, bootstrap
launchers, and host adapters. These boundaries are intentional:

| Boundary                                                              | Reason                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `axm`, `axm:local`, and `axm:link*`                                   | Launch the source CLI or link it into an external workspace                                                                     |
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
