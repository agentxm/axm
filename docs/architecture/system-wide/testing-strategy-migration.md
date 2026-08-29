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
generic `*.test.ts` naming. Functional behavior, implementation verification,
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
- Do not count implementation tests toward functional completeness.
- Do not remove old evidence until replacement coverage passes at the intended
  boundary.
- End temporary overlap within each completed slice; do not leave shims,
  aliases, or two independently editable specifications.
- Keep the fast suite deterministic and enforce an explicit performance budget.

## Phase 0: ratify the authority transition

Confirm the target authority model before moving tests:

- executable specifications are the sole local authority for all accepted AXM
  requirements, including functional, quality, security, usability,
  compatibility, architecture, and process requirements;
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
- a thin Vitest-compatible specification API;
- stable specification and scenario identities;
- requirement-class metadata and a product-shaped functional reading path;
- in-memory application-boundary harnesses;
- purpose, boundary, method, and subject reporting metadata;
- a generated specification catalog; and
- validation for duplicate identities and malformed metadata.

Do not build a general testing framework ahead of the pilot. Prefer ordinary
Vitest constructs where they remain readable and add abstraction only for
stable identity, reuse, completeness, or reporting.

### Exit gate

- A specification can be discovered, read, executed in memory, and rendered in
  the catalog and Allure without duplicated metadata.
- The catalog renders even when the implementation fails its specification.
- A specification change appears as an explicit functional-contract diff.

## Phase 2: pilot one vertical slice

Use CLI install as the recommended pilot because it spans application behavior,
workspace state, ownership, output, command handling, and end-to-end execution.

For the selected slice:

1. Inventory current requirements, normative claims in prose, architecture
   statements, behavior tests, end-to-end scenarios, schemas, and help
   contracts.
2. Define the semantic navigation tree and functional completeness denominator.
3. Author executable specifications for supported behavior.
4. Run them through the in-memory application boundary.
5. Bind only boundary-justified scenarios to end-to-end execution.
6. Reclassify remaining tests as architecture, implementation, tooling, or
   qualification evidence.
7. Compare the old and new suites for lost or contradictory behavior.
8. Remove superseded tests and every duplicate normative statement for the
   slice, including requirement wording in documentation.

### Exit gate

- The specification source reads as a coherent functional reference.
- Every in-scope functional obligation has specification coverage.
- Selected end-to-end scenarios state their boundary-specific rationale.
- Implementation-only tests remain colocated and visibly distinct.
- Reports support both semantic and execution-oriented navigation.
- The slice has one functional authority and no unexplained lost coverage.

## Phase 3: finalize reporting and completeness gates

Generalize only the mechanisms proven by the pilot:

- render specification reports by surface, capability, public contract, and
  scenario rather than package;
- render architecture, implementation, E2E qualification, tooling, and static
  verification separately;
- link one specification to all available execution boundaries;
- distinguish missing, skipped, stale, harness-failed, passed, and failed
  evidence;
- expose retries, flakes, duration, and slow-suite budgets;
- generate completeness checks from the command tree, extension-type catalog,
  ownership-unit registry, schemas, error taxonomy, and supported platform
  matrix; and
- retain package and source-path views as secondary maintainer navigation.

### Exit gate

- A reader can navigate from a product surface to an individual expected
  outcome without knowing its implementing package.
- A maintainer can filter every result by purpose and execution boundary.
- An absent specification or absent execution is visible and cannot appear as
  a pass.

## Phase 4: classify the existing suite

Inventory every current test case as one of:

- functional specification candidate;
- architecture verification;
- implementation verification;
- tooling verification;
- end-to-end or qualification evidence;
- duplicate or superseded evidence; or
- unresolved pending a behavior or architecture decision.

Classify individual `describe`, `it`, and parameterized cases rather than only
files. Split mixed files before moving them. Record unresolved cases without
allowing them to count toward any coverage claim.

Use mechanical discovery for filenames, packages, reports, and candidate
metadata. Use human judgment for authority and behavioral meaning.

### Exit gate

- Every current test has one declared primary purpose or an explicit unresolved
  disposition.
- Mixed-purpose files have a migration destination for each case.
- Duplicate tests are distinguished from intentionally diverse evidence.

## Phase 5: migrate functional slices

Migrate one product-shaped slice at a time. Recommended ordering is:

1. shared workspace construction, state, ownership, and execution behavior;
2. install, update, uninstall, and sync;
3. extension-type lifecycle and conformance;
4. settings, agents, instruction files, and inline capabilities;
5. source resolution, Registry behavior, publishing, and authentication;
6. lint, inspection, machine output, help, and diagnostics; and
7. remaining public client-core contracts.

The exact order may change when a dependency or risk boundary makes another
slice safer, but each slice uses the pilot's inventory, specification,
execution, comparison, and cutover sequence.

### Exit gate per slice

- Functional requirements and behavior tests have been reconciled into one
  executable specification authority.
- Completeness gates pass for every applicable catalog or public surface.
- The fast in-memory execution meets its performance budget.
- Old ambiguous or duplicate tests and links are removed.

## Phase 6: separate implementation and tooling verification

After functional cases move to `specifications/`, rename and organize the
remaining evidence:

- colocate `*.implementation.test.ts` with the source it protects;
- retain `*.type-test.ts` for compile-time contracts;
- move repository automation to `*.tooling.test.ts` where the suffix improves
  discovery;
- distinguish architecture checks from ordinary implementation tests in
  metadata and reports; and
- keep shared test support free of product assertions that belong in a
  specification.

Delete generic `*.test.ts` uses when their purpose remains ambiguous. Do not
create compatibility include patterns after the migration is complete.

### Exit gate

- Source paths and filenames communicate primary test purpose.
- Functional specifications no longer live among implementation tests.
- Test support packages contain runners and fixtures rather than hidden
  behavioral authority.

## Phase 7: align commands and CI

Introduce purpose-oriented targets and compose existing repository gates from
them:

```text
pnpm test:spec
pnpm test:implementation
pnpm test:tooling
pnpm test:e2e
pnpm test:qualification
pnpm test
pnpm test:all
```

Preserve Nx caching, affected execution, build dependencies, native Windows
coverage, binary and installation qualification, JUnit output, and Allure
generation. Update CI job names and artifacts so failures communicate their
purpose immediately.

### Exit gate

- Local commands, Nx targets, CI jobs, artifacts, and reports use one taxonomy.
- `test` is the fast required suite and `test:all` adds the slower boundary and
  qualification suites.
- No required current platform or release evidence was dropped during target
  reorganization.

## Phase 8: cut over authority, uninstall the Gen Stack pack, and remove the corpus

Retire the Gen Stack corpus only after all retained meaning has a verified
destination.

Map current sources as follows:

| Current meaning                                              | Target owner                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Functional requirements                                      | Product-shaped executable specifications                                                                             |
| Quality, security, usability, and compatibility requirements | Executable specifications with purpose-fit runners and cadence                                                       |
| Required architecture constraints                            | Architecture-class executable specifications                                                                         |
| Process and repository requirements                          | Executable process or tooling specifications                                                                         |
| Evaluation Protocol criteria and cases                       | Specification definitions and their runners                                                                          |
| Architecture responsibilities, boundaries, and decisions     | Non-normative `docs/architecture/` explanations and decision records; enforceable consequences remain specifications |
| External standards and schemas                               | The external authority for definitions plus a specification for AXM's local adoption, applicability, and deviations  |
| Intent and rationale needed for future decisions             | The narrowest non-normative product or architecture explanation                                                      |
| Execution results                                            | CI, JUnit, Allure, and other repository-native evidence stores                                                       |

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
- preserved end-to-end, platform, binary, installer, and release evidence;
- specification identity and metadata validity;
- completeness against independently enumerable product surfaces;
- no unexplained reduction in scenario, contract, or failure coverage; and
- clean removal of superseded paths at slice cutover.

The migration does not use total test count or line coverage as a preservation
oracle. Those numbers may change substantially when duplicate and mixed-purpose
tests are split or removed.

## Open design decisions

The pilot must resolve these decisions before broad migration:

- the stable specification and scenario identity format;
- the exact boundary between declarative specification metadata and ordinary
  Vitest code;
- the Nx project and package ownership of `specifications/` and shared runners;
- how the generated catalog and Allure share metadata without one becoming a
  second functional authority;
- the performance budget for the fast specification suite;
- the policy for preserving removed public behavior beyond Git history; and
- which runners and cadences provide evidence for quality, security, usability,
  compatibility, architecture, and process specifications.

Resolve these from the pilot's evidence. Do not expand the framework or begin a
repository-wide move while any decision changes the meaning, ownership, or
execution shape of every specification.
