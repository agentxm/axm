---
type: Decision
status: stable
description: Every production library declares a strategic domain by its placement under `packages/{core,supporting,generic}/` and a technical role in its tags; the two are enforced as independent dependency matrices, with named contract seams and engineering tooling barred from runtime.
depends-on:
  - ../package-architecture.md
  - ./colocated-specifications.md
  - ./typescript-dual-alias.md
---

# Package classification and dependency policy

## Decision

A package carries two orthogonal classifications, and both constrain what it
may import.

**Strategic domain comes from placement.** A production library lives at
`packages/<domain>/<name>` where `<domain>` is `core`, `supporting`, or
`generic`. [`scripts/placement-tags-plugin.ts`](../../../scripts/placement-tags-plugin.ts)
contributes `domain:<domain>` to the project graph from that path.
`apps/<name>` and `tools/<name>` carry no domain. Any other placement — a
package directly under `packages/`, or nesting deeper than one level — fails
graph construction, and a `project.json` that authors a `domain:*` tag of its
own fails for the same reason. Placement and tag can therefore never disagree.

`core` is the distinctive extension-management model AXM exists to own.
`supporting` is necessary but undifferentiated adaptation to external systems
and native agent surfaces. `generic` is for broadly shared problems where an
adopted solution would otherwise win; it is empty, because the adopted
dependencies already cover those needs.

**Technical role is authored.** Every production project declares exactly one
of `role:contract`, `role:integration`, `role:capability`, `role:feature`, or
`role:application`; end-to-end projects declare `role:e2e` and engineering
libraries under `tools/` declare `role:tooling`. Role states the direction of a
dependency, not its strategic worth: a capability may be supporting, and an
integration may be core.

**The matrices are independent.** Both are configured as
`@nx/enforce-module-boundaries` constraints in
[`eslint.config.mjs`](../../../eslint.config.mjs), every matching constraint is
applied, and a dependency is legal only when it satisfies all of them.

| Source role   | May depend on                                        |
| ------------- | ---------------------------------------------------- |
| `application` | feature, capability, integration, contract           |
| `feature`     | capability, integration, contract                    |
| `capability`  | capability, integration, contract                    |
| `integration` | integration, contract, and `scope:extension-content` |
| `contract`    | contract                                             |
| `e2e`         | tooling and contract only                            |
| `tooling`     | any library                                          |

| Source domain | May depend on                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `core`        | core, supporting, generic                                                                            |
| `supporting`  | supporting, generic, and the named seams `extension-model`, `registry-protocol`, `extension-content` |
| `generic`     | generic                                                                                              |

A feature never depends on a feature: shared behaviour moves inward to a
capability rather than creating a feature-to-feature edge. Cycles are never
permitted, and the rule's circular checks run with no ignored project pairs.

**Two seams are named exactly, not by tier.** `@agentxm/extension-model` and
`@agentxm/registry-protocol` cross the repository boundary: the AgentXM
Registry imports them, and the platform repository adopts them as its shared
kernel. Their constraints are written by `scope:` tag rather than by domain —
the model may depend on nothing but itself and a fixed external budget
(`effect`, `packageurl-js`, `semver`, `spdx-expression-parse`), and the
protocol may depend only on the model. `@agentxm/extension-content` is a third
narrow grant: it reads the model and nothing else, so integrations and
supporting packages may consume content behaviour without pulling workspace or
transport packages behind it.

**Engineering tooling never enters runtime.** No runtime role lists
`role:tooling` among its permitted targets, so production source cannot import
the libraries under `tools/`. A parallel relaxed constraint set applies to
test-purpose files (`*.test.ts`, `*.spec.ts`, `**/src/**/test-support/**`), which
may compose them — colocated specifications import the specification metadata
contract, and tests import the shared deterministic adapters. The ban is
expressed as an omission from each role's allowlist rather than as a transitive
`notDependOnLibsWithTags`, because a transitive ban would flag every runtime
consumer of a library that merely tests itself.

**Placement also decides the task and TypeScript surface.** Nothing about a
package's targets is authored per project:

- `@nx/eslint/plugin` infers `lint` for every project the root flat
  configuration covers.
- `@nx/vitest` infers `test` from `{apps/cli,packages/**,tools/**}/vitest.config.ts`
  and, scoped separately, `e2e-main` from `apps/cli-e2e/vitest.config.ts`.
- [`scripts/typecheck-plugin.ts`](../../../scripts/typecheck-plugin.ts) infers
  `typecheck` from `{apps/*,packages/*/*,tools/*}/tsconfig.spec.json`, so the
  same placement glob that classifies a package gives it a type check.
- `@nx/js/typescript` is registered for project-reference synchronization only
  (`typecheck: false`, `build: false`); `nx sync:check` detects reference drift.
- Each project keeps a solution `tsconfig.json` referencing `tsconfig.lib.json`
  (extending `tsconfig.lib-base.json`) and `tsconfig.spec.json` (extending
  `tsconfig.test-base.json`), which is where the Effect language-service
  diagnostic severities differ between production and test source.

**Handlers stay on the application boundary.** Nx tags cannot separate the CLI
composition root from the command handlers in the same project, so a focused
`no-restricted-imports` override over `apps/cli/src/root/**` forbids handlers
from constructing plans, calling workspace writers, or reaching transactions,
sources, and the Registry client directly. Contract types stay importable for
rendering. `apps/cli/src/runtime.ts` and `apps/cli/src/cli-runtime/**` are
outside the rule; they are the composition root and the runtime envelope.

**Classify self-update by purpose.** The earlier choice to place `cli-update`
under core followed its imports of operation progress and failure vocabulary.
That dependency is real, but it does not establish strategic significance.
Self-update is supporting CLI maintenance. Its installation facts, platform
support, version comparison, and upgrade decisions now belong to the
frontstage `cli-maintenance/self-update/domain` module. They have no dependency
on workspace execution or installer I/O.

The remaining `cli-update` implementation retains its placement until its
application contracts, release acquisition, installation adapters, and progress
integration are separated. Do not widen the supporting allowlist or move CLI
progress vocabulary into the shared extension model to make the move legal.
The source dependency needs an architectural correction at its owning boundary.

## Context

The previous model tagged every package with one of five `layer:*` values —
`app`, `feature`, `kernel`, `integration`, `contract` — and let that single
dimension carry both "how far inward does this sit" and "how much does it
matter to the product". Those are different questions with different answers.
`registry-client` is an integration and strategically undifferentiated;
`workspace-transactions` is a low-level capability and among the most
distinctive code in the repository. One axis could express only one of them,
and `layer:kernel` in particular had become a label for "inward of a feature"
rather than a claim about anything.

Strategic classification also has to survive being wrong. It is a hypothesis
about where advantage lies, and it changes when strategy or available solutions
change. Encoding it in a directory rather than a tag makes reclassification a
visible move with a mechanical consequence — the import rules change with the
path — instead of a one-line edit nobody reviews.

## Alternatives considered

**Keep the five-tier `layer:*` vocabulary.** Rejected. It conflated strategy
with direction, and adding a strategic dimension on top of it would have left
`layer:kernel` and `role:capability` as two names for the same distinction.

**Tag strategy only, and let imports follow classification.** Rejected. Core,
supporting, and generic describe strategic roles; they do not imply an import
order. Under a strategy-only matrix, a core feature could legally import
another core feature, and the direction the architecture depends on would have
no enforcement at all.

**Tag role only, and record classification in prose.** Rejected. A
classification nothing enforces is a diagram label. The point of the strategic
axis is that supporting packages cannot reach into the core model, which is
what keeps the distinctive capability distillable.

**Author `domain:*` in each `project.json`.** Rejected. Two sources for one
fact drift, and the drift is silent: a package moved to a different tier keeps
the old tag and the old permissions. Inferring from placement makes the
directory the only authority and makes a conflicting tag a graph-construction
error.

**Widen the supporting allowlist for `cli-update`.** Rejected; see the
placement decision above. The seam is narrow on purpose, and each exception
weakens it for every supporting package, not only the one that asked.

## Consequences

- Reclassifying a package means moving its directory, which changes its
  `repository.directory`, its relative imports, and its TypeScript reference
  paths in the same reviewed change.
- `packages/generic/` has no projects. The glob stays in
  `pnpm-workspace.yaml` so the tier is available without a migration.
- Creating a package needs no dependency-matrix edit: placement and one
  `role:*` tag settle its permissions. Per-package `scope:*` tags exist for
  selection, and must not be used in `depConstraints` to rebuild an exact
  adjacency list.
- `@nx/dependency-checks` keeps each buildable package's manifest in agreement
  with what it imports, so a legal graph edge still fails lint when it is
  undeclared.
- A change to the placement plugin invalidates every cached lint task, because
  it is a declared lint input and a `sharedGlobals` member.
- The obligations this policy realizes are owned by executable specifications,
  not by this record:
  `system/architecture/public-system-depends-only-on-published-contracts` and
  `system/architecture/e2e-observes-only-shipped-artifacts` in the
  [specification catalog](../../../specifications/catalog.md). Dependency
  direction, feature isolation, acyclicity and application-only composition are
  engineering policy verified natively by the module-boundary rules and by
  [`scripts/module-boundaries.test.ts`](../../../scripts/module-boundaries.test.ts)
  and
  [`scripts/composition-root-lint-exceptions.test.ts`](../../../scripts/composition-root-lint-exceptions.test.ts).

Accepting authority: maintainer approval through the repository pull-request
workflow.

## Reconsideration

Reconsider when a genuinely generic capability appears and `packages/generic/`
gains its first occupant, when a second production application needs the
libraries and `role:application` stops meaning "the CLI", when a package's
strategic classification changes as a deliberate strategy decision, or when
Nx's constraint model can express the composition-root and handler boundaries
directly and the focused ESLint overrides become redundant. When superseded,
this record remains reachable and links its replacement.
