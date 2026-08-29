---
type: Architecture
status: draft
description: The phased migration from AXM's package-oriented tests and Gen Stack pack and corpus to executable specifications as the sole local requirements authority.
depends-on:
  - testing-strategy.md
---

# Testing strategy migration

This plan moves AXM from package-oriented tests and a separately installed and
maintained Gen Stack requirements system to the target
[testing strategy](testing-strategy.md). The migration establishes executable
specifications as the sole local source of truth for every accepted AXM
requirement. Documentation retains non-normative architecture, decisions,
rationale, and procedures without owning or restating requirements.

The plan is incremental for verification but not for permanent compatibility.
Each vertical slice may temporarily retain old and new evidence while it is
classified and proven; the slice finishes by removing its superseded tests,
links, and authority paths.

## Starting condition

The current suite is predominantly organized by implementation package and
generic `*.test.ts` naming. Functional behavior, internal verification,
architecture conformance, and tooling checks are frequently adjacent and may
share files. The end-to-end project is separately recognizable, but its results
are still reported primarily by package and execution suite.

Current Allure metadata identifies `unit` or `e2e` layer and a project name.
The main report groups results under npm packages such as
`@agentxm/client-core`, `axm.sh`, and `axm`, so it does not expose purpose or
provide a product-shaped functional reference.

The Gen Stack corpus currently owns canonical Requirements, selected
actor-facing Architecture, and Evaluation Protocols. Detailed architecture
under `docs/architecture/` and behavior tests already own substantial exact
design and scenario detail. Removing Gen Stack before mapping those authorities
would lose or obscure accepted obligations.

## Migration invariants

- Do not change supported behavior merely to simplify test migration.
- Do not infer required behavior from a passing implementation when an existing
  authority says otherwise.
- Classify at scenario level; do not bulk-rename mixed-purpose files.
- Preserve one requirements authority at every cutover point.
- Preserve useful architecture and rationale as non-normative explanatory
  context; express every enforceable consequence as a specification.
- Keep external schemas and standards authoritative for their own definitions,
  while specifications own AXM's local adoption, applicability, and deviations.
- Do not count internal tests toward functional completeness.
- Do not remove old evidence until replacement coverage passes at the intended
  boundary.
- Do not create an umbrella category that mixes requirement concern,
  observation boundary, supporting evidence, and release selection.
- End temporary overlap within each completed slice; do not leave shims,
  aliases, or two independently editable specifications.
- Keep the fast suite deterministic and enforce an explicit performance budget.

## Phase 0: ratify the authority transition

Confirm the target authority model before moving tests:

- executable specifications are the sole local authority for all accepted AXM
  requirements, including functional, installability, compatibility,
  performance, security, usability, quality, architecture, process, and
  external-conformance requirements;
- specification execution supplies evidence rather than changing the
  specification;
- architecture documents and decisions retain explanatory design meaning but
  cannot establish or duplicate requirements;
- schemas and external standards retain authority for their own definitions,
  while a specification owns AXM's adoption and scope; and
- human review accepts specification additions, revisions, and retirements.

Record the cutover rule in repository instructions only after the pilot proves
the model. Until then, existing Gen Stack declarations remain authoritative.

### Exit gate

- Maintainers have accepted executable specifications as the sole local
  requirements source of truth.
- Every existing Gen Stack concept class has a named target disposition.
- No artifact class is scheduled for deletion without a destination for the
  meaning that remains necessary.
- No planned destination under `docs/`, `contributing/`, or repository
  instructions is described as owning an AXM requirement.

## Phase 1: establish the specification foundation

Implement the smallest infrastructure needed for one vertical slice:

- a dedicated specification Nx project or equivalent repository target;
- the `specifications/` semantic source tree;
- a minimal typed, colocated specification metadata contract;
- idiomatic Vitest, `@effect/vitest`, and purpose-fit library usage without a
  specification test-definition wrapper;
- stable requirement identities and optional case identities when a case has an
  independently reportable claim;
- requirement-class metadata and a product-shaped functional reading path;
- in-memory application-boundary harnesses;
- purpose, concern, boundary, extensible method, subject, and selection
  reporting metadata;
- native-result adapters for the generated catalog, Allure, and CI;
- a generated specification catalog; and
- validation for duplicate identities and malformed metadata.

Do not build a specification DSL or general testing framework ahead of the
pilot. Use native suites, tests, assertions, hooks, fixtures, lifecycle,
parameterization, generators, and models directly. Add shared abstraction only
for stable identity, genuine cross-method reuse, completeness, or reporting,
and never make a method label an allowlist.

### Exit gate

- A specification can be discovered, read, executed in memory, and rendered in
  the catalog and Allure without duplicated metadata.
- A specification remains directly runnable, debuggable, and navigable through
  its native test framework and development tools.
- Adding an appropriate testing method requires at most metadata normalization
  or a result adapter, not a specification-contract redesign.
- The catalog renders even when the implementation fails its specification.
- A specification change appears as an explicit requirement-contract diff.

## Phase 2: pilot one vertical slice

Use CLI install as the recommended pilot because it spans application behavior,
workspace state, ownership, output, command handling, and end-to-end execution.

For the selected slice:

1. Inventory current requirements, normative claims in prose, architecture
   statements, behavior tests, end-to-end scenarios, schemas, and help
   contracts.
2. Define the semantic navigation tree and functional completeness denominator.
3. Author executable specifications for supported behavior with native test
   framework constructs and the method best suited to each claim.
4. Run them through the in-memory application boundary.
5. Bind only boundary-justified scenarios to process, binary, packed-artifact,
   installed-product, platform, or other end-to-end execution.
6. Separate package contents, integrity, and provenance checks as artifact
   verification rather than installability behavior.
7. Reclassify remaining tests as architecture verification, internal
   verification, tooling verification, artifact verification, diagnostic
   benchmark, or boundary-specific evidence.
8. Compare the old and new suites for lost or contradictory behavior.
9. Remove superseded tests and every duplicate normative statement for the
   slice, including requirement wording in documentation.

The pilot must demonstrate that the contract supports at least three materially
different, appropriate shapes without framework contortions: an example or
decision table, a property or state-machine model, and a contract, conformance,
or golden-output check. Choose real claims suited to each method rather than
using a method only to satisfy this demonstration.

### Exit gate

- The specification source reads as a coherent functional reference.
- Every in-scope functional obligation has specification coverage.
- Each pilot method uses its native framework or library constructs directly.
- Selected end-to-end scenarios state their boundary-specific rationale.
- Installability behavior and artifact verification appear as distinct claims
  even when one workflow executes both against the same packed artifact.
- Internal tests remain colocated and visibly distinct.
- Reports support both semantic and execution-oriented navigation.
- The slice has one functional authority and no unexplained lost coverage.

## Phase 3: finalize reporting and completeness gates

Generalize only the mechanisms proven by the pilot:

- render specification reports by surface, capability, public contract, and
  scenario rather than package;
- normalize native runner results through reporting adapters without requiring
  tests to adopt a reporting-oriented DSL;
- render architecture, internal, tooling, artifact, and static verification
  separately from authoritative specifications and diagnostic benchmarks;
- link one specification to all available execution boundaries;
- render end-to-end as a boundary filter rather than a competing requirement
  category;
- render release and deployment views as traceable compositions of underlying
  results rather than independently authoritative suites;
- distinguish missing, skipped, stale, harness-failed, passed, and failed
  evidence;
- expose retries, flakes, duration, and slow-suite budgets;
- preserve controlled-environment and statistical context for performance
  specifications and benchmarks while keeping their outcomes distinct;
- generate completeness checks from the command tree, extension-type catalog,
  ownership-unit registry, schemas, error taxonomy, and supported platform
  matrix; and
- organize internal verification primarily by package and source path while
  retaining those views as secondary maintainer navigation for specifications.

### Exit gate

- A reader can navigate from a product surface to an individual expected
  outcome without knowing its implementing package.
- A maintainer can filter every result by purpose, concern, execution boundary,
  method, subject, and selection.
- An absent specification or absent execution is visible and cannot appear as
  a pass.
- A release verification view identifies its exact candidate and selection
  policy without owning duplicate test outcomes.

## Phase 4: classify the existing suite

Inventory every current test case across the target axes: purpose, concern,
boundary, method, subject, and selection. Give each case one primary
disposition:

- authoritative specification candidate, including functional, installability,
  compatibility, performance, security, usability, architecture, process, and
  external-conformance concerns;
- architecture verification;
- internal verification;
- tooling verification;
- artifact or supply-chain verification;
- boundary-specific execution of another claim;
- diagnostic benchmark or experiment;
- duplicate or superseded evidence; or
- unresolved pending a behavior or architecture decision.

Classify individual `describe`, `it`, and parameterized cases rather than only
files. Split mixed files before moving them. Record unresolved cases without
allowing them to count toward any coverage claim.

Use mechanical discovery for filenames, packages, reports, and candidate
metadata. Use human judgment for authority and behavioral meaning.

Classify existing timing checks deliberately. An accepted measurable bound and
its material conditions become a performance specification. A comparison or
optimization measurement becomes a diagnostic benchmark. A timeout used only
to keep the harness bounded remains execution infrastructure and does not imply
a performance requirement.

### Exit gate

- Every current test has one declared primary purpose or an explicit unresolved
  disposition.
- Mixed-purpose files have a migration destination for each case.
- Duplicate tests are distinguished from intentionally diverse evidence.

## Phase 5: migrate requirement slices

Migrate one product-shaped slice at a time. Recommended ordering is:

1. shared workspace construction, state, ownership, and execution behavior;
2. install, update, uninstall, and sync;
3. extension-type lifecycle and conformance;
4. settings, agents, instruction files, and inline capabilities;
5. source resolution, Registry behavior, publishing, and authentication;
6. lint, inspection, machine output, help, and diagnostics; and
7. remaining public client-core contracts;
8. supported platform, runtime, shell, and filesystem compatibility;
9. performance, security, usability, and other quality obligations; and
10. architecture, process, and external-conformance requirements.

The exact order may change when a dependency or risk boundary makes another
slice safer, but each slice uses the pilot's inventory, specification,
execution, comparison, and cutover sequence.

### Exit gate per slice

- In-scope requirements and existing evidence have been reconciled into one
  executable specification authority with purpose-fit runners.
- Completeness gates pass for every applicable catalog or public surface.
- The fast in-memory execution meets its performance budget.
- Old ambiguous or duplicate tests and links are removed.

## Phase 6: separate supporting verification and diagnostics

After functional cases move to `specifications/`, rename and organize the
remaining evidence:

- colocate `*.internal.test.ts` with the source it protects;
- retain `*.type-test.ts` for compile-time contracts;
- move repository automation to `*.tooling.test.ts` where the suffix improves
  discovery;
- move non-normative package contents, integrity, and provenance checks to
  `*.artifact.test.ts` under the artifact-verification owner;
- move non-normative performance measurements to `*.bench.ts` and keep their
  trend data separate from specification outcomes;
- distinguish architecture checks from ordinary internal tests in
  metadata and reports; and
- keep shared test support free of product assertions that belong in a
  specification.

Delete generic `*.test.ts` uses when their purpose remains ambiguous. Do not
create compatibility include patterns after the migration is complete.

### Exit gate

- Source paths and filenames communicate primary test purpose.
- Functional specifications no longer live among internal tests.
- Test support packages contain runners and fixtures rather than hidden
  behavioral authority.
- No test-purpose metadata, filename, command, or report category uses
  `implementation` as an alias for `internal`.
- No test-purpose metadata, filename, command, folder, or report category uses
  `qualification` or `distribution` as an umbrella alias.
- Required installability, compatibility, performance, and conformance claims
  remain specifications; artifact checks and benchmarks cannot count toward
  specification completeness unless explicitly bound as runners.

## Phase 7: align commands and CI

Introduce purpose-oriented targets and compose existing repository gates from
them:

```text
pnpm test:spec
pnpm test:internal
pnpm test:tooling
pnpm test:e2e
pnpm test:compatibility
pnpm test:performance
pnpm verify:artifact
pnpm verify:release
pnpm verify:deployment
pnpm bench
pnpm test
pnpm test:all
```

Preserve Nx caching, affected execution, build dependencies, native Windows
coverage, binary and installed-product evidence, artifact integrity and
provenance checks, JUnit output, and Allure generation. Update CI job names and
artifacts so failures communicate their purpose immediately.

`test:compatibility` and `test:performance` select specifications by concern.
`verify:artifact` and `verify:deployment` require an identified artifact or
environment. `verify:release` composes policy-required evidence for one exact
release candidate rather than discovering a `release` test suite. `bench`
produces diagnostic trend evidence and never contributes a behavioral pass
count.

### Exit gate

- Local commands, Nx targets, CI jobs, artifacts, and reports use one taxonomy.
- `test` is the fast required suite and `test:all` adds broadly executable
  slower boundary and specification selections.
- Release and deployment verification fail clearly when an exact candidate or
  target environment is absent rather than reporting a vacuous pass.
- No required current platform or release evidence was dropped during target
  reorganization.

## Phase 8: cut over authority, uninstall the Gen Stack pack, and remove the corpus

Retire the Gen Stack corpus only after all retained meaning has a verified
destination.

Map current sources as follows:

| Current meaning                                            | Target owner                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Functional requirements                                    | Product-shaped executable specifications                                                                              |
| Installability and compatibility requirements              | Executable specifications selected across installed-product and platform boundaries                                   |
| Performance, security, usability, and quality requirements | Executable specifications with purpose-fit runners, controlled conditions, and cadence                                |
| Required architecture constraints                          | Architecture-class executable specifications                                                                          |
| Process and repository requirements                        | Executable process or tooling specifications                                                                          |
| Evaluation Protocol criteria and cases                     | Specification definitions and their runners                                                                           |
| Architecture responsibilities, boundaries, and decisions   | Non-normative `docs/architecture/` explanations and decision records; enforceable consequences remain specifications  |
| External standards and schemas                             | The external authority for definitions plus a specification for AXM's local adoption, applicability, and deviations   |
| Artifact contents, integrity, and provenance evidence      | Repository-native artifact and supply-chain verification bound to specifications only when it evaluates a requirement |
| Non-normative benchmark histories                          | Diagnostic benchmark storage and trend reports                                                                        |
| Intent and rationale needed for future decisions           | The narrowest non-normative product or architecture explanation                                                       |
| Execution results                                          | CI, JUnit, Allure, and other repository-native evidence stores                                                        |

Perform cutover as one bounded sequence:

1. Reconcile every active Gen Stack Requirement and every other normative prose
   claim into an accepted executable specification. Retire duplicate wording;
   do not copy it into `docs/`.
2. Audit `docs/`, contributor documentation, repository instructions, decision
   records, indexes, and generated help for claims that imply they own AXM
   requirements. Keep useful architecture, rationale, and procedures, but
   remove Requirement records, Requirement IDs, normative Requirement sections,
   and statements that assign requirements authority to Markdown.
3. Update all links and repository guidance to route requirement discovery and
   changes to `specifications/`. Documentation may link to a specification ID
   without restating its normative expectation.
4. Preview the exact project-scope pack removal and review its current closure:

   ```text
   pnpm axm uninstall @craigsmitham/packs/gen-stack --scope project --preview --json
   ```

5. Apply that reviewed removal non-interactively:

   ```text
   pnpm axm uninstall @craigsmitham/packs/gen-stack --scope project --yes --json
   ```

   The uninstall owns removal of the pack from `axm.json`, its accepted lock
   resolution, installed pack members no longer reachable through another
   declaration, and their agent projections. Use a fresh preview at cutover;
   the closure may differ from the current workspace as dependencies change.

6. Delete the repository-owned `gen-stack/` corpus after its requirements have
   migrated. Pack uninstall does not own or remove this corpus.
7. Remove Gen Stack-specific scripts, generated artifacts, hook and CI gates,
   instruction blocks, index entries, and inbound links. Do not leave a dormant
   corpus, compatibility path, or alternate requirements authority.
8. Verify canonical installed content, desired `axm.json` state, accepted
   `axm-lock.yaml` resolution, and each configured agent's projections. Then run
   `pnpm axm packs list --scope project --json`, `pnpm axm lint --json`, and
   `pnpm axm sync --preview --fail-on-change --json`, followed by repository
   formatting, specification completeness, tests, and workspace verification.

### Exit gate

- Every active functional obligation resolves to an executable specification.
- Every other accepted local requirement resolves to an executable
  specification with an appropriate runner and cadence.
- Retained architecture and rationale remain discoverable without claiming
  requirements authority.
- Repository instructions name the new authority model.
- `axm.json`, `axm-lock.yaml`, installed canonical content, and agent projections
  contain no Gen Stack pack membership unless a separately declared extension
  remains reachable for a non-Gen-Stack purpose.
- The repository-owned `gen-stack/` corpus is absent.
- No live source, link, generated artifact, or required check depends on
  `gen-stack/`, Gen Stack tooling, or `AXM-REQ-*` identifiers.
- No document is described as a requirements authority or contains a duplicate
  normative formulation of a specification.
- Specification completeness and execution reports pass on the cutover
  revision.
- Documentation and workspace verification pass after removal.

## Verification throughout migration

Each phase verifies:

- source and report navigation from a reader's perspective;
- deterministic execution and runtime budget;
- equivalence or an explicitly approved behavior change;
- preserved end-to-end, platform, binary, installed-product, artifact,
  provenance, release, and deployment evidence;
- preserved performance obligations and benchmark history with their authority
  distinction intact;
- specification identity and metadata validity;
- completeness against independently enumerable product surfaces;
- no unexplained reduction in scenario, contract, or failure coverage; and
- clean removal of superseded paths at slice cutover.

The migration does not use total test count or line coverage as a preservation
oracle. Those numbers may change substantially when duplicate and mixed-purpose
tests are split or removed.

## Open design decisions

The pilot must resolve these decisions before broad migration:

- the stable requirement identity and optional independently reportable case
  identity format;
- the smallest metadata carrier and discovery mechanism that does not wrap
  native test definitions;
- the Nx project and package ownership of `specifications/` and shared runners;
- how native result adapters feed the generated catalog and Allure without
  either becoming a second functional authority;
- the performance budget for the fast specification suite;
- the controlled environments, workloads, sampling policy, and evidence
  retention for normative performance specifications;
- the benchmark baseline, comparison, and retention policy for diagnostic
  trends;
- the exact artifact identity and evidence-selection policy used by
  `verify:release`;
- the policy for preserving removed public behavior beyond Git history; and
- which runners and cadences provide evidence for quality, security, usability,
  installability, compatibility, performance, architecture, process, and
  external-conformance specifications.

Resolve these from the pilot's evidence. Do not expand the metadata contract or
begin a repository-wide move while any decision changes the meaning, ownership,
or execution shape of every specification.
