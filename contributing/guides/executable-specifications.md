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
| `*.bench.ts`     | Diagnostic measurements; never specification evidence    |

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
- `role` is `experience` for behavior meaningful while a person or agent
  completes a product task, `interface` for a public machine-consumable
  contract, or `supporting` for a subordinate system or engineering
  obligation. The catalog and Allure hierarchy present them as Product
  behavior, Programmatic interfaces, and Supporting system behavior. Native
  test names carry the reportable scenarios beneath each requirement.
- Declare lineage, assumptions, open questions, and evidence limitations.
  Manual or review-only evidence remains unverified until established.
- Boundary execution and static checks bind to the same requirement identity;
  they do not establish a second requirement.

`boundary` describes the default evidence's actual observation boundary. Use
`platform` when production services read or mutate native filesystem state,
including an in-process workspace fixture. Running without a child process does
not make that evidence `memory`. Pure decisions and service-port recordings
remain `memory`; loading example input from disk alone does not change that
classification. Checks of committed generated artifacts use `repository`.
Name the observed property in `boundaryRationale`, preserve material substitute
limitations, and bind additional process or installation evidence separately.

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
examples, evidence changes, moves, and implementation impact, and renders the
evidence status of every affected requirement; missing evidence renders as
missing, never as a pass. Maintainer review
accepts requirement changes; `**/*.spec.ts` is routed through CODEOWNERS.
Implementation work alone does not authorize changing accepted requirements.

Explain removals in `specifications/disposition-ledger.json` with `requirement`,
`disposition`, and `basis`; `superseded-by` also names `successor`. Other
supported dispositions are `engineering-policy`, `converted-to-test`, and
`retired`. A successor's `supersedes` declaration also explains retirement.
Unexplained removals remain visible in the verdict. Reports and pull requests
include the rendered specification impact, including the computed
`No requirement contract changes.` result when applicable.

Removing a command, subcommand, or flag adds no absence test. The
[command inventory test](../../apps/cli/src/root/shared/command-inventory.test.ts)
compares registered routes and rendered parameters with the inventory exactly,
so deleting the inventory entry is the removal's evidence. The accepted
`cli/unknown-commands-remain-usage-errors` specification already covers retired
commands.

## Existing verification bindings

The fast-specification budget currently caps the sum of Vitest file times at
360 seconds across owner projects, enforced by `scripts/check-spec-budget-lib.ts`.
This aggregate is not elapsed developer feedback time. The
[colocation decision](../../docs/architecture/decisions/colocated-specifications.md)
owns that existing binding and its revision.

The install-source policy's `test:policy-coverage` target applies complete
coverage thresholds only to the bounded source selection in
`packages/core/workspace-features/vitest.policy.config.ts`, with reports under
`test-results/policy-quality/`. It emits no specification receipts; benchmark
results stay diagnostic and never count toward specification completeness.

Release, artifact, and deployment targets enforce their subject identity.
`cli-e2e:binary-smoke-artifact` verifies the binary named by `AXM_BINARY_PATH`,
and `cli-e2e:install-verification` in production mode requires
`AXM_EXPECTED_VERSION`; each fails rather than passing vacuously when its
subject is absent. Release evidence comes only from the authorized GitHub
Actions flow in the [release runbook](../../devops/runbooks/release-cli.md).

Specifications run per change on purpose-fit runners selected by their
metadata. A slower runner declares a scheduled or release-candidate selection
rather than slowing the fast suite.

The compiled listing latency requirement runs through `cli-e2e:test:performance`,
which builds the host executable before measuring fresh processes. Run it alone
on the Linux reference host: it checks 20 samples per output format after three
warmups, reports the first invocation separately, and records the host and binary
SHA-256. The full `cli-e2e:e2e` graph includes this uncached, serialized target.
Specification selection routes performance cases to an owner’s `test:performance`
target when present, including `pnpm test:performance` and selection by requirement.
The latency case is excluded from the concurrently executed general process suite because
competing CLI processes invalidate its reference-host timing assumption.

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
