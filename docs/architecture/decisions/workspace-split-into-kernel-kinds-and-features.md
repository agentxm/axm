---
type: Decision
status: stable
description: The workspace compiler is three packages — a kernel capability, an extension-kind capability, and a feature package — each built from flat folder slices, with direction between packages enforced by Nx and direction, isolation, and acyclicity between slices enforced by lint and the source-graph check.
depends-on:
  - ../package-architecture.md
  - ./package-classification-and-dependency-policy.md
---

# Workspace split into kernel, kinds, and features

## Decision

The single `@agentxm/workspace` package is replaced by three private packages
under `packages/core/`. Like the package they replace, they are bundled into
`axm.sh` rather than published:

| Package                       | Role              | Owns                                                                                                                                                                                                  |
| ----------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@agentxm/workspace-kernel`   | `role:capability` | Workspace state, the operations contract, acquisition, sources, resolution, projection and native agent adapters, planning, the materialization port and manager registry, reconciliation, settlement |
| `@agentxm/extension-kinds`    | `role:capability` | Managers, install and uninstall plans, authoring scaffolds, and typed failures for skills, subagents, MCP connections, hooks, instructions, Knowledge, and Packs                                      |
| `@agentxm/workspace-features` | `role:feature`    | Lifecycle, authoring, publishing, configuration, inspection, linting, discovery, sync, Knowledge query, and sharing use cases                                                                         |

Dependencies point one way: features depend on kinds and the kernel, kinds
depend on the kernel, and the kernel depends only on contracts, the
`@agentxm/extension-content` capability, and supporting and generic packages. The kernel knows no kind and no feature, not
even as a type.

**Every unit is a flat slice.** Inside each package, each unit is exactly one
folder under `src/`, and its `index.ts` is its entry. The package exports one
`./<slice>` per folder and no root. A slice adds `./<slice>/live` or
`./<slice>/testing` only when that folder has a `live.ts` or `testing.ts`.
`@agentxm/extension-kinds` also exports `./live`, which composes every kind's
manager Layer. MCP credentials remain native-host responsibilities. Nested subpaths such
as the former `transitions/planning` or `resolution/sources` are retired; a
slice's `/live` and `/testing` entries are the only second-level subpaths.

**Kernel slices are ordered.** From lowest to highest: `settlement`,
`operations`, `agent-adapters`, `workspace-state`, `projection`, `acquisition`,
`sources`, `resolution`, `planning`, `materialization`, `reconciliation`. A
kernel slice imports only slices below it. `operations` is a contract slice. It
holds the plan, operation-resolution, event, journal, interruption, recovery,
refusal, install-selection, and `StepFailure` vocabulary that every layer above
it speaks, and it imports nothing from the workspace.

**No kind imports another kind, and no feature imports another feature.** What
two kinds or two features share moves inward, into a kernel slice. Features
share test support only through
`workspace-features/src/testing/`, which is not exported and is importable only
from feature test files.

**Failure rendering follows the same direction.** The kernel renders only
kernel-owned failure families. Kind failures carry their own rendering data
through a kernel-declared brand, `ExtensionKindFailure`. Each feature that owns
a failure family renders it. The CLI composes kernel and feature renderers into
one catalog at its composition root, so wording is unchanged on the direct and
plan paths.

**Enforcement uses tools the repository already runs:**

- **Between packages.** `@nx/enforce-module-boundaries` applies the existing
  role and domain matrices, with no ignored project pairs. Kernel and kinds
  share `role:capability`, so two `scope:` rows forbid the kernel from depending
  on either outer package, and the kinds from depending on features. Nx's
  circular checks reject any cycle between the three projects.
- **Between slices.** `eslint-plugin-boundaries`, configured in
  [`tools/architecture/slices.mjs`](../../../tools/architecture/slices.mjs),
  classifies every file by its slice. It allows only the directions above,
  through a slice's `index`, `live`, or `testing` entry file, and its explicit
  denials cover kind to kind, feature to feature, kernel to kind or feature,
  and production to test. Unknown files and unknown dependencies are errors.
- **Cycles.**
  [`tools/architecture/check.mjs`](../../../tools/architecture/check.mjs) runs
  dependency-cruiser over the three package roots and the existing capability
  roots. It rejects file cycles and cycles between slice folders, including
  type-only edges.

## Context

The accepted architecture already stated that a feature never depends on a
feature, that cycles are never permitted, and that nine workspace subpaths were
`role:feature` modules. Nothing enforced those statements for the workspace:

- All of its units lived in one Nx project tagged `role:capability`, so the
  module-boundary rule saw no edges between them.
- The source-graph gate covered only a few narrow roots.

A value-import measurement of the package showed:

- 18 of its 24 units in one strongly connected component;
- 31 two-unit cycles;
- more than 900 cross-unit value edges.

The cycles ran through a few hubs:

- a failure-recognition module that imported twenty units;
- a materialization error module that named every kind's errors;
- lifecycle vocabulary that every kind imported;
- barrel modules that re-exported kind managers and kind plan functions
  through capability and feature entries.

The enforcement that did exist was costly. Three overlapping systems each held
part of the policy:

- Nx matrices;
- literal source-path exceptions in the flat ESLint configuration;
- about a thousand lines of bespoke dependency-cruiser, boundary-descriptor, and
  capability-cycle code.

Adding one package took three sequential rounds of verification before every
system agreed.

The package architecture already said that a substantial independent boundary
should normally become a package, so that Nx can model it directly. The
consolidation that produced the single package kept one package for good
reasons: separate peer packages had obscured ownership and required broad
cross-package paths. This decision keeps that result for the units that belong
together, and gives Nx only the boundaries that carry a different dependency
rule.

## Alternatives considered

**A. Keep one package and add slice lint only.** Rejected. Slice lint could
express feature and kind isolation inside the package. It would still require
breaking the same cycles, because the rules cannot pass over the current graph.
It would leave:

- the tier direction and tier cycles visible to one lint layer only;
- one TypeScript project, whose compilation cannot prove that the kernel
  compiles without kinds or features;
- `nx affected` treating every change in the workspace as touching every
  consumer;
- the architecture documentation calling capability code a feature.

The cost of the split over this option is manifests and project files. That
cost is paid once and is small next to the cycle breaking both options require.

**B. Many packages, one per feature and one per kind, around a kernel.**
Rejected. It would give Nx every boundary directly, but it repeats the layout
that the earlier consolidation removed:

- about eighteen manifests, project files, TypeScript configuration trios,
  build targets, and dependency declarations;
- broad cross-package paths for code that changes together.

The seven kinds share one materialization port and never import one another.
The ten features share the same kernel and kinds. A package per unit therefore
adds release and build machinery without adding a dependency rule that slice
lint cannot state. Buildable-library and transitive-dependency checks would
also require every one of those packages to build and to declare every edge.

**C. Three tiers of packages, with slices inside each (chosen).** Nx models the
only two boundaries whose dependency rule differs: kernel beneath kinds, and
kinds beneath features. It also checks cycles between them. It gives each tier
its own TypeScript project reference and affected granularity. Isolation among
peers inside a tier uses one declarative slice configuration and the cycle
check that were already installed. The bespoke capability-cycle code, and the
path exceptions it required, can then be deleted.

## Consequences

- Three packages replace one. Each has a manifest with slice exports, a project
  with `type:lib`, its role, and its `scope:` tag, a build target, the
  TypeScript configuration trio, a Vitest configuration, and a README. The old
  package and its README are deleted.
- `desired-state` is renamed `workspace-state`. Its `desired/` and `observed/`
  subfolders are organisational; the direction between them is not yet
  enforced. The nested `transitions/*`, `projection/agent-adapters`,
  `resolution/sources`, and `knowledge/query` entries become the flat
  `settlement`, `planning`, `agent-adapters`, `sources`, and `knowledge-query`
  slices.
- Pack-membership authoring moves to the authoring feature, and Pack unpacking
  moves to the lifecycle feature. Kind-owned install code stays in the kind.
  The kernel reaches MCP installation only through a manager port.
- Specifications that exercise lifecycle or authoring use cases over kind
  fixtures move to the feature slice that owns those use cases. Their
  identities are path-independent, so the specification verdict reports them
  as moved. Specifications whose lineage metadata names source paths are
  updated and render as revised contracts.
- The policy-coverage and mutation targets move with the install-selection
  policy to `@agentxm/workspace-features`. The Windows suite moves to
  `@agentxm/workspace-kernel`.
- The CLI composes the failure catalog, the kinds' `./live`, and the kernel
  `/live` entries at its runtime composition root. Handlers keep their
  existing import restrictions, now named against kernel slice entries.
- The flat ESLint configuration names package globs and generic test-support
  patterns instead of source paths inside one package. The capability-cycle
  module, its test, and its graph dependency are removed.
- Creating a unit inside a tier means adding a slice folder, its export entry,
  and, for a kernel slice, its position in the kernel order. Creating a package
  remains reserved for a boundary with a different dependency rule, release
  lifecycle, or compiler purpose.
- Dependency direction, feature and kind isolation, and acyclicity remain
  engineering policy, not product requirements. They are verified natively by
  the module-boundary rules,
  [`scripts/module-boundaries.test.ts`](../../../scripts/module-boundaries.test.ts)
  (including kernel-imports-kinds and kinds-import-features cases), and the
  `tools/architecture` tests.
- No command, output, or failure wording changes. The specification that
  failures render identically on the direct and plan paths remains the gate.

Accepting authority: maintainer approval through the repository pull-request
workflow.

## Reconsideration

Reconsider this layout in any of these cases:

- A slice needs its own release lifecycle, or a production consumer outside the
  CLI. That slice becomes a package.
- Two kinds or two features need each other. Treat that as a missing kernel or
  kinds capability, not as a licence for a peer edge.
- Nx can express folder-level boundaries inside a project natively. The slice
  lint layer then becomes redundant.
- The `desired/` and `observed/` halves of workspace state become an enforced
  direction. That adds rows to the slice configuration, not packages.

When superseded, this record remains reachable and links its replacement.
