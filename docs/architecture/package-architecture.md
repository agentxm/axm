---
type: Architecture
status: stable
description: The target package responsibilities, dependency direction, enforcement, and Nx workspace conventions for decomposing extension management.
depends-on:
  - ./overview.md
  - ./principles.md
  - ./commands/overview.md
  - ./workspace/overview.md
  - ./system-wide/testing-strategy.md
  - ./decisions/typescript-dual-alias.md
  - ./decisions/executable-specifications-authority.md
  - ./decisions/specification-infrastructure.md
---

# Package architecture

This document explains the target implementation structure for decomposing
`@agentxm/extension-management`. The command and workspace architecture define
what AXM does; this package architecture defines where reusable implementation
responsibilities live and which dependencies are permitted between them. The
executable specifications in the
[specification catalog](../../specifications/catalog.md) remain the sole local
requirements authority.

## Purpose

The refactor exists to make the code structure express the product structure.
`@agentxm/extension-management` currently groups workspace state, mutation
mechanics, extension semantics, external integrations, and complete CLI use
cases behind one package boundary. Those responsibilities change for different
reasons, and the broad boundary allows unrelated code to depend on one another
without making that coupling visible.

The target architecture replaces that grab bag with cohesive packages whose
names state the capability they own. Large user-facing capabilities such as
sync and lint become vertical feature packages. Reusable state, operation
mechanics, and integrations sit behind narrower inward-facing boundaries. The
CLI remains the composition and interaction boundary.

## Desired outcomes

The refactor is successful when it produces all of these outcomes:

- **Cohesive ownership.** Each package has one recognizable reason to change
  and owns a complete capability, shared kernel, integration, or contract.
- **Explicit, minimal coupling.** Dependencies point inward through declared
  public APIs. A feature imports only the lower-level capabilities it uses.
- **Independent workspace boundaries.** Workspace state, operation mechanics,
  and extension-specific workspace semantics are separate packages rather than
  internal folders inside another broad workspace package.
- **Vertical feature slices.** Sync, lint, lifecycle, authoring, publishing,
  discovery, configuration, inspection, authentication, and Knowledge queries
  each own their end-to-end application policy without depending on another
  feature package.
- **A thin application shell.** `axm.sh` owns parsing, prompts, presentation,
  process behavior, and Effect Layer composition; it does not own reusable
  business policy.
- **Enforceable architecture.** Nx tags and lint rules reject invalid layer
  dependencies, dependency checks keep manifests aligned with actual imports,
  package exports reject deep access, and focused import rules preserve the
  application composition boundary. Static results bind to stable architecture
  requirements without reproducing Nx's graph in custom test code.
- **Low-cost package growth.** New packages inherit conventional build, lint,
  test, typecheck, cache, and release behavior with little per-project
  configuration.
- **Clean pre-launch breaks.** Each extraction updates the canonical package
  boundary and every producer, consumer, test, generated input, and document in
  the same change. The existing package does not survive as a compatibility
  façade, shim, alias, dual export, or deprecated import path.

These outcomes favor separation of responsibilities over a small package
count. Package count is not itself a goal: a package earns its boundary when it
has a distinct responsibility, public API, dependency budget, and focused
verification.

## Non-goals

This refactor does not:

- change the user-visible command model or workspace authority model;
- preserve compatibility for internal package names, import paths, exports, or
  intermediate layouts superseded by the target structure;
- create generic `core`, `common`, `shared`, or `utils` packages;
- require every small command to become a feature package before its behavior
  warrants one;
- make the packages independently versioned while they ship as one CLI product;
  or
- require Nx Cloud, Nx Agents, Enterprise Conformance, or test atomization to
  enforce the TypeScript package graph.

## Target structure

The architecture has five layers. Dependencies point downward and never back
toward the application. Feature packages are peers: shared behavior moves to an
inward package instead of creating feature-to-feature dependencies.

```mermaid
flowchart TB
  CLI["axm.sh\napplication shell"]
  FEATURES["Vertical features\nsync · lint · lifecycle · authoring · publish\ndiscovery · configuration · inspection · auth · Knowledge query"]
  KERNELS["Shared kernels\nworkspace-state · workspace-operations · extension-workspace"]
  INTEGRATIONS["Integrations\nextension-sources · agent-integration · registry-client"]
  PROTOCOL["@agentxm/registry-protocol"]
  MODEL["@agentxm/extension-model"]

  CLI --> FEATURES
  CLI -- "types for presentation" --> PROTOCOL
  CLI -- "types for presentation" --> MODEL
  CLI -. "composes */live" .-> KERNELS
  CLI -. "composes */live" .-> INTEGRATIONS
  FEATURES --> KERNELS
  FEATURES --> INTEGRATIONS
  FEATURES --> PROTOCOL
  FEATURES --> MODEL
  KERNELS --> PROTOCOL
  KERNELS --> MODEL
  INTEGRATIONS --> PROTOCOL
  INTEGRATIONS --> MODEL
  PROTOCOL --> MODEL
```

The dotted application edges are composition-only, and the application's
contract edges carry the types needed to render typed feature results; neither
authorizes invoking lower-level services outside the composition root. Command
handlers invoke feature APIs; they do not bypass a feature and implement its
use case directly against a kernel or integration.

### Contracts

The existing shared contracts remain the innermost packages.

| Package                      | Responsibility                                                                                                  | Expected inward dependencies |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `@agentxm/extension-model`   | Platform-neutral extension identity, types, manifests, constraints, package identity, and agent capability data | None                         |
| `@agentxm/registry-protocol` | Registry wire contracts, protocol error vocabulary, content parsing, and contract-level publication validation  | `@agentxm/extension-model`   |

Dependency columns in this document describe expected direction, not
permission to declare every listed dependency by default. Each manifest
includes only what its implementation imports. Nx derives the actual adjacency
from source imports and manifests; the architecture does not maintain a second
exact allowlist of every present and absent edge.

The extension model keeps its explicit dependency budget. A contract package
does not acquire filesystem, terminal, workspace, or transport behavior.

### Shared kernels

Workspace management is divided into distinct packages rather than recreated
as internal modules under a new umbrella.

| Package                         | Responsibility                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@agentxm/workspace-state`      | Settings, lockfile, desired and observed state, authority, repositories, and snapshots                        |
| `@agentxm/workspace-operations` | Plans, semantic mutation closures, outcomes, transactions, journals, rollback, and safe application mechanics |
| `@agentxm/extension-workspace`  | Extension-type workspace semantics, canonical content, contributor calculation, and projection contributions  |

The intended lower-level graph is deliberately small:

```mermaid
flowchart LR
  OPERATIONS["workspace-operations"] --> STATE["workspace-state"]
  EXTENSION_WORKSPACE["extension-workspace"] --> STATE
  EXTENSION_WORKSPACE --> PROTOCOL["registry-protocol"]
  EXTENSION_WORKSPACE --> MODEL["extension-model"]
  STATE --> PROTOCOL
  STATE --> MODEL
  PROTOCOL --> MODEL
```

`workspace-operations` is generic only within the AXM workspace model. It owns
the mechanics for safely applying a plan, but not the feature policy that
decides which plan should exist. Every feature that changes workspace state —
sync, lifecycle, authoring, configuration — builds its own plan and applies it
through `workspace-operations`; no feature executes another feature's plans.
`extension-workspace` owns the extension-type
knowledge required to derive canonical and projected state; it does not own a
complete lifecycle or sync workflow.

### Integrations

Integration packages isolate change driven by external systems and native
agent surfaces.

| Package                      | Responsibility                                                                                     | Expected inward dependencies          |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `@agentxm/extension-sources` | Source syntax, source resolution, probing, and acquisition across Registry, Git, and local sources | Registry client and contracts         |
| `@agentxm/agent-integration` | Agent detection and adapters for native agent capability surfaces                                  | Extension model                       |
| `@agentxm/registry-client`   | Registry transport, caching, OAuth transport primitives, and generated client integration          | Registry protocol and extension model |

`@agentxm/extension-sources` may depend on `@agentxm/registry-client`; other
integration packages do not depend on features or the CLI. Integrations expose
typed services at their package root and concrete environment-backed Layers
through explicit `./live` exports.

### Vertical features

A vertical feature package owns a complete reusable use case. It contains the
policy, orchestration, typed failures, typed result, and focused tests needed by
the CLI and other sanctioned entry points. It depends on contracts, kernels,
and integrations through their public service APIs.

| Package                            | Use cases it owns                                                                                                 | Expected inward dependencies                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `@agentxm/workspace-sync`          | Desired-state reconciliation planning, projection realization, and reconciliation outcomes                        | Workspace state and operations, extension workspace, sources, agent integration |
| `@agentxm/workspace-lint`          | Workspace facts, lint rules, findings, normalization, and bounded fix planning                                    | Workspace state and operations, extension workspace, agent integration          |
| `@agentxm/extension-lifecycle`     | Install, update, uninstall, enable, and disable across root and type-specific command forms                       | Workspace state and operations, extension workspace, sources, agent integration |
| `@agentxm/extension-authoring`     | New, fork, import, adopt, demote, version, and authored pack membership                                           | Workspace state and operations, extension workspace, contracts                  |
| `@agentxm/extension-publish`       | Publish selection, validation, authentication requirements, upload, settlement, and recovery                      | Workspace state, extension workspace, registry client, registry protocol        |
| `@agentxm/extension-discovery`     | Project detectors, local declarations, Registry recommendations, and discovery results                            | Workspace state, extension sources, registry client, extension model            |
| `@agentxm/workspace-configuration` | Setup, configured-agent membership, instruction management, and inline workspace capabilities such as MCP servers | Workspace state and operations, extension workspace, agent integration          |
| `@agentxm/workspace-inspection`    | List, view, inventory, and version-currency queries                                                               | Workspace state, extension workspace, sources, registry client                  |
| `@agentxm/registry-auth`           | Login, logout, token, identity inspection, device and loopback flows, and credential lifecycle                    | Registry client and registry protocol                                           |
| `@agentxm/knowledge-query`         | Knowledge concept resolution, retrieval, search, related concepts, and status                                     | Workspace state and extension workspace                                         |

Smaller capabilities such as cache housekeeping or self-upgrade remain in the
CLI or a focused integration until they develop enough policy and reuse to earn
a feature package. They do not go into an unrelated existing feature merely to
avoid creating a package later.

`@agentxm/workspace-lint` does not absorb contract-level validation used by
publication and Registry ingestion. That shared contract remains in
`@agentxm/registry-protocol`; workspace lint composes facts and findings about
installed and authored workspace state.

## Application and public API boundaries

`axm.sh` owns:

- command registration, arguments, and flags;
- interactive prompts and confirmation;
- human and machine rendering;
- mapping typed feature failures to `AppError`, exit codes, and output;
- telemetry and process lifetime; and
- final Effect Layer composition.

The CLI-local runtime envelope, error mapping, telemetry consent and redaction,
and telemetry transport stay in the application package while the CLI is their
only sanctioned consumer. They earn a separate integration package only if a
second production application needs the same boundary.

Feature packages own use-case decisions. Lower packages never import CLI
commands, flags, prompts, renderers, `AppError`, or process-lifetime behavior.

The application may consume types from contracts and kernels to render typed
feature results; it may not invoke kernel or integration services outside the
composition root. Features do not re-export lower-level types their results
reference merely to keep presentation imports legal.

A command handler may invoke multiple feature APIs in sequence — for example,
a lifecycle mutation followed by reconciliation. Fixed sequencing of feature
use cases is application wiring, not reusable policy. When the sequence
acquires decisions of its own — conditionals on intermediate results beyond
error handling, partial-failure policy, or retry semantics — that policy
belongs in a feature package.

Every production package declares intentional `exports`. Its root exports the
public service contract, schemas, domain types, and pure behavior that inward
consumers may use. Environment-backed implementations live behind an explicit
`./live` export. In production source, only application composition imports
`*/live`; feature logic retains service requirements in its Effect
environment. Test code has a bounded exception: a package's own tests may
import its own `./live` export, and integration tests may compose a lower
package's live Layer. Executable specifications keep exercising the CLI
through its published harness entry points rather than composing package
Layers themselves.

A package that ships `./live` may also ship `./testing`: deterministic
in-memory Layer implementations of its own root services, with controlled
clock, identifier, and filesystem defaults — and nothing else. Fixtures for
other packages and assertion helpers stay with their consumers. Production
source never imports `*/testing`; tests and specifications may. Specification
support composes package-owned `./testing` ports rather than owning duplicate
test doubles.

The specification harness is part of the CLI's declared public surface —
`axm.sh/specification-harness`, alongside `axm.sh/app` and `axm.sh/runtime` —
not an `unstable` subpath. An entry point that drives the requirements corpus
has earned a stable export.

Deep imports into another package's `src`, `unstable`, generated files, or
internal folders are forbidden. A needed cross-package symbol either belongs
in the provider's public API or reveals that the responsibility is in the wrong
package. A broad barrel is not added merely to make an import legal.

## Dependency rules

Every project receives tags along independent dimensions; `layer`, `scope`,
and `release` apply only to production packages:

| Dimension | Values and meaning                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | `type:app`, `type:lib`, `type:e2e`, or `type:tooling`; retains the existing project-kind constraints                                                |
| `layer`   | `layer:app`, `layer:feature`, `layer:kernel`, `layer:integration`, or `layer:contract`                                                              |
| `scope`   | A package-specific tag such as `scope:workspace-sync`; supports focused selection and future policy without defining dependency direction by itself |
| `release` | `release:cli` for every publishable package that ships in the fixed CLI release group                                                               |

The layer rules are:

| Source layer | May depend on                                                      |
| ------------ | ------------------------------------------------------------------ |
| Application  | Features and any lower package needed only for runtime composition |
| Feature      | Kernels, integrations, and contracts                               |
| Kernel       | Kernels and contracts                                              |
| Integration  | Integrations and contracts                                         |
| Contract     | Contracts                                                          |

A feature may not depend on another feature. A kernel and an integration may
depend on a peer only where that dependency remains inward and is justified by
the packages' responsibilities. Stable asymmetric restrictions use focused Nx
tag constraints rather than a separately maintained whole-workspace adjacency
list. Cycles are never permitted.

E2e and test-support projects carry no `layer:*` tag; inventing pseudo-layers
for them would recreate the exact-adjacency habit this architecture removes.
The existing `type:*` constraints continue to govern them: e2e projects
observe published artifacts and entry points, consistent with the
`system/architecture/e2e-observes-only-shipped-artifacts` specification, and
may use test-support libraries; tooling projects depend only on libraries.

## Enforcement

The architecture separates stable obligations from the tools that verify them.
The durable obligations are inward dependency direction, feature isolation,
acyclicity, public package APIs, and application-only composition of concrete
implementations. The exact set of dependencies present at one migration stage
is implementation state derived by Nx, not another normative graph to maintain.

### Project topology

Nx owns the production project graph. `@nx/enforce-module-boundaries` applies
the `type:*` and `layer:*` matrices and keeps its circular-dependency checks
enabled without ignored project pairs. Its configuration also enables:

- `enforceBuildableLibDependency` so a buildable package cannot acquire a
  non-buildable production dependency;
- `banTransitiveDependencies` so production code cannot silently import an
  undeclared transitive package; and
- `allowedExternalImports` or `bannedExternalImports` for exceptional external
  dependency budgets, including the platform-neutral extension model.

General layer constraints own dependency direction. Add a package-specific
constraint only for a stable asymmetric boundary that the layer matrix cannot
express, such as `registry-protocol` depending on `extension-model` or
`extension-sources` depending on `registry-client`. Every package carries a
`scope:*` identity tag for selection and future policy; the prohibition is on
referencing per-package tags in `depConstraints` to rebuild an adjacency list,
not on the tags existing.

The flat ESLint configuration applies the boundary rule to `.ts`, `.tsx`,
`.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs`. Registering the inferred
`@nx/eslint/plugin` supplies a lint task to every project under the root config;
both the inferred task coverage and the rule's file patterns are required.

### Manifest fidelity

`@nx/dependency-checks` owns agreement between a buildable or publishable
package's build inputs and its `package.json`. Package manifests are included in
lint through `jsonc-eslint-parser`, with missing, obsolete, and version-mismatch
checks enabled. Together with module boundaries, this rejects:

- an imported workspace edge that violates its layer policy;
- a production import missing from the owning package manifest;
- an obsolete declared workspace or external dependency; and
- an imported external package outside a constrained package's budget.

This coverage replaces custom code that reads selected manifests and compares
them with a hard-coded dependency allowlist.

### Public APIs and composition

Every production package declares intentional `exports`, and TypeScript uses a
resolution mode that honors them. Nx synchronizes TypeScript project references,
and `nx sync:check` detects reference drift.

Nx project constraints cannot distinguish the CLI runtime composition root from
command handlers in the same project or distinguish a package root from its
`./live` entry point. Focused ESLint `no-restricted-imports` overrides therefore:

- forbid `@agentxm/*/live` in production source outside the CLI composition
  root, leaving the test and specification-harness exceptions above intact;
- prevent command handlers from bypassing feature APIs to call kernels or
  integrations directly;
- restrict specification imports to the CLI's published entry points, the
  contract packages, and `*/testing` exports — never a kernel, integration, or
  feature root — so the specification corpus observes the boundary it
  verifies; and
- forbid imports through another package's `src`, `unstable`, internal generated
  files, or other undeclared subpaths.

Where a meaningful internal direction remains inside one package, use the same
focused ESLint mechanism. A substantial independent boundary should normally
become a package so Nx can model it directly.

### Requirement and verification ownership

The existing
`system/architecture/packages-follow-permitted-dependency-graph` specification
hand-reads selected manifests, duplicates current ESLint scope constraints, and
changes whenever a package is extracted. It does not represent the complete Nx
project graph and should not remain the long-term architecture requirement or
verifier.

The target requirements lifecycle is:

1. accept, in one reviewed requirements change, two stable successor
   requirements: acyclic, inward production package dependencies with feature
   isolation — including that no feature executes another feature's plans —
   and application-only `*/live` composition with the test and specification
   exceptions above; they fail independently and have different verifiers, so
   they are separate requirements rather than one;
2. retire the exact-adjacency requirement with its identity and history
   preserved under the specification lifecycle; and
3. bind the Nx and ESLint architecture-gate results to the successor
   requirements as static verification evidence, declared as literal-only
   bound-evidence metadata beside the specification contract so the catalog
   reads it statically.

Until that requirements change is accepted and landed, the existing executable
specification remains the sole local authority for its current obligation. The
architecture document does not silently supersede it. The
[testing strategy](system-wide/testing-strategy.md#static-verification) defines
how a static gate satisfies an authoritative requirement without becoming a
competing requirements source. Do not introduce a shared custom policy module
merely so ESLint and a specification can consume the same exact adjacency
table; Nx configuration remains the implementation policy and the specification
remains the requirements authority.

Bound evidence supports an owning specification; it never replaces one. Each
successor requirement keeps its specification file even when a static gate
supplies the decisive verification, so the specification corpus remains the
sole requirements authority. The same bound-evidence declaration is the general
channel for later package-level evidence, not a one-off for the architecture
gates.

### No additional complementary tools

Do not add another dependency-analysis or architecture-testing library at this
stage. The planned package boundaries give Nx sufficient granularity, and the
remaining composition exceptions fit ordinary ESLint configuration. In
particular:

- do not add dependency-cruiser while package topology and a small number of
  file-level restrictions cover the required boundaries;
- do not add Knip as an architecture gate; unused-file and unused-export
  analysis is a separate hygiene concern and is not currently required; and
- do not adopt Nx Enterprise Conformance for the TypeScript-only graph.

Reconsider complementary tooling only after evidence shows a boundary Nx and
focused ESLint rules cannot express—for example, numerous durable folder-level
constraints or production dependencies from languages ESLint cannot inspect.

## Nx workspace direction

Nx should own ordinary task discovery, dependency ordering, caching, affected
selection, and project-boundary enforcement. Repository scripts should own
AXM-specific workflows. This keeps package creation cheap without hiding domain
behavior inside build-tool configuration.

At the start of this refactor, only `@nx/js/typescript` is registered for task
inference even though the ESLint and Vitest Nx plugins are installed. Most
lint and test targets are repeated explicitly, some e2e and test-support
projects have no lint target, build and release metadata repeats project lists,
the module-boundary override omits `.mts`, `.cts`, `.mjs`, and `.cjs`, and the
root lint inputs include a nonexistent `tools/eslint-rules` directory. The
current exact-graph specification also scans only selected runtime manifests,
while Nx already derives additional source edges such as
`cli-e2e` to `extension-management`. These are migration conditions, not
conventions to reproduce in new packages.

### Keep the current strengths

Retain pnpm workspace project discovery, the acyclic Nx project graph, affected
workflows, `projectsAffectedByDependencyUpdates: "auto"`, TypeScript project
reference synchronization, named cache inputs, version plans, and one fixed CLI
release group. Keep explicit `@nx/js:tsc` build targets while the
[dual TypeScript toolchain](decisions/typescript-dual-alias.md) requires the
in-process TypeScript 6 compiler for published artifacts.

### Infer conventional tasks

Register the plugins already present in the workspace so Nx can infer the
ordinary target surface:

- `@nx/eslint/plugin` infers `lint` for every project covered by the root flat
  ESLint configuration. This closes current coverage gaps for projects such as
  `cli-e2e` and `e2e-utils` and removes repeated lint target definitions. The
  root module-boundary override expands to all TypeScript and JavaScript module
  extensions at the same time; task inference alone does not change which
  files a rule matches.
- `@nx/vitest` infers ordinary package and specification `test` targets in run
  mode. A second scoped plugin instance maps the default CLI e2e config to
  `e2e-main`. Windows, compiled-binary, artifact, and installation suites remain
  explicit because they carry distinct dependencies, environment, or config.
- `@nx/js/typescript` continues to infer `typecheck` and synchronize project
  references, but sets `build: false`. AXM's explicit `@nx/js:tsc` builds are
  intentional, and disabling inferred builds avoids unused `build-deps` and
  `watch-deps` targets.

The target plugin shape is:

```jsonc
{
  "plugins": [
    {
      "plugin": "@nx/js/typescript",
      "options": {
        "typecheck": {
          "targetName": "typecheck",
          "configName": "tsconfig.json",
        },
        "build": false,
      },
    },
    {
      "plugin": "@nx/eslint/plugin",
      "options": { "targetName": "lint" },
    },
    {
      "plugin": "@nx/vitest",
      "include": ["packages/**/vitest.config.ts", "specifications/vitest.config.ts"],
      "exclude": ["packages/cli-e2e/**"],
      "options": { "testTargetName": "test", "testMode": "run" },
    },
    {
      "plugin": "@nx/vitest",
      "include": ["packages/cli-e2e/vitest.config.ts"],
      "options": { "testTargetName": "e2e-main", "testMode": "run" },
    },
  ],
}
```

Plugin scopes and the resulting project details must be inspected with
`nx show project` during implementation. Root tooling tests remain explicit
where their config does not belong to a separate Nx project.

### Centralize target defaults

Move common executor behavior to `targetDefaults`. Package project files then
state only entry points, output exceptions, generation dependencies, and other
genuinely local behavior.

```jsonc
{
  "targetDefaults": {
    "@nx/js:tsc": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"],
      "outputs": ["{projectRoot}/dist"],
    },
    "test": {
      "cache": true,
      "dependsOn": ["^build"],
      "outputs": ["{workspaceRoot}/test-results/{projectName}"],
    },
    "nx-release-publish": {
      "cache": false,
      "dependsOn": ["build", "^nx-release-publish"],
    },
  },
}
```

Do not restate manual `test` inputs that replace better inputs inferred from
Vitest. Custom Allure reporter outputs are not inferred, so the shared output
declaration remains. When a project adds to an inherited array, use Nx's `...`
spread token—for example, `"dependsOn": ["...", "generate"]`—instead of
copying the default and allowing it to drift.

Use native `nx:noop` for aggregate targets such as `generate` whose only job is
to depend on other targets. Replace exact dependency build lists with `^build`
where the package graph already expresses the relationship. Exact lists remain
only where a repository tool intentionally operates on a fixed set unrelated to
its owning project's dependencies.

### Make release membership declarative

Tag every publishable package in the CLI product with `release:cli` and select
the release set with `"projects": ["tag:release:cli"]`. Release workflows use
the same matcher rather than maintaining a second project list. Keep
`projectsRelationship: "fixed"` and version plans while these unstable packages
ship as one product. Create another release group only when a package gains a
genuinely independent lifecycle.

Keep `nx` and all `@nx/*` packages on the same version and take supported patch
upgrades together. A package refactor is not a reason to split their versions.

### Standardize package creation

Use the official `@nx/js:library` generator for new packages with workspace
defaults for:

- the `tsc` bundler;
- ESLint;
- Vitest in the Node environment;
- strict TypeScript;
- `project.json` configuration; and
- buildable and publishable setup where the package ships with the CLI.

Supply the package's `layer:*`, `scope:*`, and `release:cli` tags when it is
created. Do not build a custom generator until repeated AXM-specific edits
remain after the official generator and workspace defaults are in place.

### Keep domain workflows custom

Custom targets and scripts remain appropriate when they implement AXM-specific
work rather than merely invoking a tool. This includes:

- Registry and telemetry contract synchronization and client generation;
- extension-type matrices, CLI help, schemas, and bundled-skill generation;
- cross-platform compilation and artifact verification;
- release metadata, checksums, assets, GitHub, and Homebrew workflows;
- CI change classification and container workflows;
- Allure report orchestration; and
- executable specification selection and verdict generation.

Remove configuration that no longer describes a real input, such as the stale
`tools/eslint-rules/**/*` lint input, and remove workflow invocations that repeat
an already declared target dependency.

Nx Cloud remote caching, Nx Agents, the Vitest Atomizer, and task sandboxing are
later optimizations. Adopt them only after measuring a CI or isolation problem;
they are not prerequisites for the package architecture.

## Migration shape

The refactor proceeds from inward boundaries to outward features:

1. Establish tags, full lint coverage, dependency checks, package export
   rules — including promoting the specification harness to the stable
   `axm.sh/specification-harness` export and restricting specification imports
   to sanctioned entry points — and the idiomatic Nx defaults before
   multiplying the package count.
2. After the replacement requirements are accepted, bind the Nx and ESLint
   static gates to them and retire
   `system/architecture/packages-follow-permitted-dependency-graph`. Do not
   retain the old manifest scanner as a second verifier.
3. Extract `workspace-state`, `workspace-operations`, and
   `extension-workspace`, preserving the authority and execution models
   described by the workspace architecture.
4. Extract `registry-client`, `extension-sources`, and `agent-integration` so
   feature packages depend on stable service boundaries rather than old
   internals.
5. Move one complete vertical slice at a time. Sync and lint are good early
   slices because they exercise the state, planning, findings, and composition
   boundaries without requiring features to depend on each other.
6. Move the remaining lifecycle and command capabilities, updating the CLI,
   manifests, project references, tests, generated inputs, documentation, and
   Nx boundary constraints in the same change.
7. Delete `@agentxm/extension-management` after its final consumer moves. Do
   not retain a façade, alias, compatibility export, or deprecated import path.

A migration step is complete only when the new package owns its public API and
tests, any deterministic in-memory ports it owns have moved from specification
support into its `./testing` export, no old deep import remains, the Nx graph
shows only permitted edges, and the repository verification workflows pass.

## Nx references

- [Enforce module boundaries](https://nx.dev/docs/features/enforce-module-boundaries)
- [Enforce module boundaries rule](https://nx.dev/docs/kb/enforce-module-boundaries)
- [External import constraints](https://nx.dev/docs/guides/enforce-module-boundaries/ban-external-imports)
- [Dependency checks](https://nx.dev/docs/kb/dependency-checks)
- [Nx with ESLint](https://nx.dev/docs/technologies/eslint/introduction)
- [Nx with Vitest](https://nx.dev/docs/technologies/test-tools/vitest/introduction)
- [Nx with TypeScript](https://nx.dev/docs/technologies/typescript/introduction)
- [`nx.json` reference](https://nx.dev/docs/reference/nx-json)
- [`@nx/js:library` generator](https://nx.dev/docs/technologies/typescript/generators)
- [Release groups](https://nx.dev/docs/guides/nx-release/release-groups)
- [Nx release and support policy](https://nx.dev/docs/reference/releases)
