# Specification contract

The [Testing skill](../../skills/testing/src/SKILL.md) owns testing philosophy.
This reference owns AXM's local requirement acceptance, source conventions,
and evidence tooling. The [task interface](../../docs/guides/repository-task-interface.md)
owns commands, prerequisites, cache freshness, and verification gates.

## Acceptance

An accepted `*.spec.ts` is the sole local authority for its requirement. Merging
it to `main` accepts it; a behavior change lands its specification change with
it. Undecided obligations stay in a work item or `openQuestions`. A successor
retires every identity it `supersedes` in the same change.

A specification earns that authority when it states a decided rule with standing
outside its author, survives a rewrite of its implementation, and has no existing
specification owner. Ordinary tests and observed implementation behavior do not
establish acceptance. Shared obligations belong to one corpus; AXM specifies its
own conformance to the named public contract without restating another owner's
obligation.

## Source and execution

Colocate specifications with the source they govern, within an authored
project's source root. Discovery uses the Nx graph. The owning project runs its
specifications and ordinary tests together through `test`; `apps/cli-e2e` owns
process, binary, and installation evidence through `e2e`. No central
specification project or shared application harness exists.

| File             | Meaning                                                  |
| ---------------- | -------------------------------------------------------- |
| `*.spec.ts`      | One authoritative requirement, exporting `specification` |
| `*.test.ts`      | Ordinary evidence; no specification metadata             |
| `*.e2e.test.ts`  | Boundary execution in a project tagged `role:e2e`        |
| `*.type-test.ts` | Compile-time assertions                                  |
| `*.bench.ts`     | Diagnostic measurements                                  |

Specifications use native test-framework constructs. Import
`defineSpecification`, `defineExecutionBinding`, and `defineBoundEvidence` from
[`@agentxm/specification-metadata`](../../tools/specification-metadata/README.md).
Its schemas own field forms and vocabularies; metadata is literal-only so the
catalog can read it without executing tests.

- `requirement` is a stable identity with two or more kebab segments separated by
  `/`. Preserve it when moving a file; never reuse a retired identity.
- The title and decisive examples use domain language. `statement` is one
  normative sentence using `shall` or `shall not`.
- `goals` references the shared registry or `specifications/product-goals.ts`.
  Do not redefine shared goals. Class, role, boundary, method, and selection
  describe the obligation and its evidence independently.
- Declare lineage, assumptions, open questions, and evidence limitations.
  Manual or review-only evidence remains unverified until established.
- Boundary execution and static checks bind to the same requirement identity;
  they do not establish a second requirement.

Within the owning project, import the subject through its public root or slice
entry by relative path. Import other packages by package name and their declared
entries; test support from another package uses its `./testing` or
`./<slice>/testing` export. Owner-local fixtures stay unpublished. CLI adapter
specifications use `axm.sh/runtime` for its automation contract.

## Catalog, results, and changes

`specifications/catalog.md` is generated from canonical sources and includes
requirements without passing executions. The shared purpose setup labels files
as specification, ordinary test, or E2E. Receipts preserve source revision,
runtime mode, boundary, and execution state. Source-mode freshness binds to
TypeScript sources; built-mode freshness also includes runtime artifacts.
Missing, stale, skipped, filtered, partial, or incorrectly labelled evidence
never counts as a pass.

The verdict distinguishes contract changes, possible rule changes in decisive
examples, evidence changes, moves, and implementation impact. Maintainer review
accepts requirement changes; `**/*.spec.ts` is routed through CODEOWNERS.
Implementation work alone does not authorize changing accepted requirements.

Explain removals in `specifications/disposition-ledger.json` with `requirement`,
`disposition`, and `basis`; `superseded-by` also names `successor`. Other
supported dispositions are `engineering-policy`, `converted-to-test`, and
`retired`. A successor's `supersedes` declaration also explains retirement.
Unexplained removals remain visible in the verdict. Reports and pull requests
include the rendered specification impact, including the computed
`No requirement contract changes.` result when applicable.

## Existing verification bindings

The fast-specification budget currently caps the sum of Vitest file times at
360 seconds across owner projects, enforced by `scripts/check-spec-budget-lib.ts`.
This aggregate is not elapsed developer feedback time. The
[colocation decision](../../docs/architecture/decisions/colocated-specifications.md)
owns that existing binding and its revision.

The install-source policy's `test:policy-coverage` target applies complete
coverage thresholds only to the bounded source selection in
`packages/core/workspace-features/vitest.policy.config.ts`. `test:policy` runs
those cases without coverage; `test:policy-mutation` is an explicit diagnostic
using the uncached target, with reports under `test-results/policy-quality/`.
Surviving or equivalent mutants require review; runner failures do not prove a
mutant was detected. These checks emit no specification receipts.

## Commands

Use the root instructions' Nx environment settings. Select only the targets
relevant to the change; this is a command reference, not a required sequence.

| Need                                             | Command                                               |
| ------------------------------------------------ | ----------------------------------------------------- |
| Regenerate discovery, conformance, and catalog   | `pnpm exec nx run axm:generate:specification-catalog` |
| Run one owner's evidence                         | `pnpm exec nx run <owner>:test`                       |
| Select one requirement                           | `pnpm test:spec --requirement <id>`                   |
| Exercise process and binary boundaries           | `pnpm exec nx run cli-e2e:e2e`                        |
| Validate specification and test file conventions | `pnpm exec nx run axm:verify-source-hygiene`          |
| Render the requirement diff                      | `pnpm exec nx run axm:specification-verdict`          |
