---
type: Architecture
status: draft
description: The target testing architecture in which executable specifications are the sole local source of truth for AXM requirements and distinct suites provide complementary evidence.
depends-on:
  - ../overview.md
  - ../principles.md
---

# Testing strategy

AXM uses executable specifications as the sole local normative authority for
accepted requirements. Fast in-memory execution provides exhaustive evidence
for functional behavior, while other specification runners and end-to-end,
implementation, tooling, qualification, and static verification provide
evidence with different purposes, boundaries, cadences, and blind spots.

This document defines the target testing architecture. The
[testing strategy migration](testing-strategy-migration.md) owns the transition
from the current package-oriented suites and Gen Stack requirement authority.
Until that migration reaches its authority cutover, existing canonical sources
retain their current authority.

## Outcomes

The testing architecture must make two views equally clear:

- A reader can navigate executable specifications as the requirements reference
  for AXM, moving from a product surface, quality, constraint, or public
  contract to a specific scenario and expected result.
- A maintainer can tell whether a test specifies supported behavior, verifies
  implementation details, exercises an end-to-end boundary, qualifies a
  distribution, or protects repository tooling.

The specification catalog covers every accepted AXM requirement. Its fast
in-memory subset aims to cover all supported functional behavior. That is
behavioral coverage against an explicit product inventory, not a claim about
line or branch coverage.

## Authority

Executable specification source under `specifications/` is the sole local
source of truth for what AXM is required to do, achieve, preserve, prevent, or
constrain. This includes accepted functional, quality, security, usability,
compatibility, architecture, and process requirements. Executing a
specification against an implementation produces evidence about whether the
implementation satisfies it. A result or report never changes the
specification.

Consequently:

- Changing a normative expectation is a specification change, not routine test
  maintenance.
- A failing specification identifies disagreement between required and
  realized behavior; it does not weaken the requirement.
- Passing every discovered specification does not prove completeness unless an
  independent inventory establishes what must be specified.
- Human review accepts requirement additions, changes, and removals.
- Refactoring implementation should not change specifications unless it also
  intentionally changes an accepted requirement.

No Markdown document, architecture decision record, issue, schema, report,
ordinary test, or implementation artifact owns or duplicates a local AXM
requirement. Documentation may explain architecture, decisions, rationale,
procedures, and current structure, but it does not establish normative product
or engineering obligations. Any enforceable consequence of that prose is
expressed by an executable specification and linked rather than restated.

Externally owned standards and schemas remain authoritative for their own
definitions and conformance semantics. An AXM specification owns the local
decision to adopt a named version, its applicability, and any deviations.
Repository instructions and contributor procedures may govern how work is
performed without becoming a second requirements corpus for AXM.

## Classification model

Tests are classified on independent axes instead of one flat unit/integration
taxonomy.

| Axis     | Values                                                                    | Question answered                  |
| -------- | ------------------------------------------------------------------------- | ---------------------------------- |
| Purpose  | `specification`, `architecture-verification`, `implementation`, `tooling` | What claim does this test support? |
| Boundary | `memory`, `process`, `binary`, `platform`, `deployed`                     | Where does the observation occur?  |
| Method   | `example`, `property`, `conformance`, `contract`, `fuzz`, `smoke`         | How is the claim assessed?         |
| Subject  | Surface, capability, public contract, package, or implementation unit     | What does the test assess?         |

End-to-end is a boundary, not a competing authority. An in-memory scenario and
an end-to-end scenario may execute the same specification through different
drivers. A utility test is a specification when it protects a supported public
contract and an implementation or tooling test otherwise.

## Suite responsibilities

### Functional specifications

The specification suite is fast, deterministic, and primarily in memory. It
exercises application boundaries using controlled implementations of external
ports and states expected behavior entirely in product language.

Specifications cover, as applicable:

- successful behavior and material alternatives;
- boundaries, empty states, and invalid input;
- expected failures and observable diagnostics;
- state transitions and durable postconditions;
- idempotence and preservation of unrelated state;
- ownership, authority, and authorization;
- interruption and recovery;
- exact output when that output is a supported contract; and
- conformance across every member of a declared product catalog.

Example-based scenarios are not the only method. Decision tables,
property-based tests, state-machine models, contract tests, conformance
matrices, fuzzing, and stable golden output are used where they express the
behavior more completely or expose different blind spots.

### Other requirement specifications

Quality, security, usability, compatibility, architecture, and process
requirements use the same authoritative specification model and stable
identity as functional behavior. They may use benchmarks, static analysis,
schema checks, dependency analysis, security tooling, platform matrices, or
other purpose-fit runners and may execute at a slower cadence. Their execution
method does not move their normative statement into documentation, runner
configuration, or a report.

The generated reference keeps functional behavior as the primary
product-shaped reading path and provides separate views for these other
requirement classes.

### End-to-end evidence

End-to-end tests select high-value or high-risk scenarios whose consequential
behavior cannot be established confidently in memory. They exercise real
boundaries such as the CLI process, filesystem, compiled binary, installer,
operating system, authentication provider, or Registry transport.

Every end-to-end scenario records the boundary-specific reason it exists. It
does not duplicate an in-memory scenario unless the additional boundary
provides distinct evidence. Shared scenario inputs and expected outcomes are
preferred when behavior is intentionally identical, while setup and
observation paths remain independently capable of exposing boundary defects.

### Architecture verification

Architecture verification checks documented structural relationships and
design decisions that are not themselves actor-visible functional behavior.
When a structural constraint is required, its normative statement belongs to
an architecture-class specification and the architecture check is its runner.
Other architecture checks are diagnostic evidence and do not create
requirements. Examples include package dependency direction, entry-point
composition, ownership-unit registration, generated contract coherence, and
adapter participation.

### Implementation verification

Implementation tests protect algorithms, internal state machines, parsers,
resource lifetimes, concurrency primitives, and difficult internal failure
paths. They are colocated with the implementation they protect and may change
or disappear during a behavior-preserving refactor.

Implementation tests do not count toward functional-specification
completeness, and private symbol names or call relationships do not appear in
the functional reference.

### Tooling verification

Tooling tests protect repository scripts, generators, release automation, and
test infrastructure. Public library utilities use functional specifications
for supported contracts and implementation tests for internal realization.

### Qualification and operational checks

Qualification verifies the artifacts and environments users actually receive:
compiled binaries, installation and upgrade paths, supported operating
systems, runtime versions, packaging, and published-artifact integrity.

A small operational smoke set may verify deployed or externally integrated
boundaries. Qualification and smoke evidence supplement rather than replace
the functional specifications and end-to-end suite.

### Static verification

Type checking, linting, Effect diagnostics, architecture-boundary enforcement,
generated-artifact consistency, source hygiene, and schema validation remain
first-class verification gates. They are reported separately from runtime
behavioral tests. When one of these gates satisfies a requirement, it binds its
result to the authoritative specification identity instead of owning the
requirement itself.

## Physical organization

Specification source is organized by stable product meaning rather than by the
packages that currently implement it:

```text
specifications/
  cli/
    install/
    uninstall/
    sync/
    lint/
  client-core/
    source-resolution/
    workspace-state/
  system/
    quality/
    security/
    architecture/
    process/

tests/
  e2e/
  qualification/

packages/
  core/src/**/*.implementation.test.ts
  cli/src/**/*.implementation.test.ts

scripts/**/*.tooling.test.ts
```

The final Nx project and package boundaries may refine these physical roots,
but they must preserve the semantic browsing hierarchy. End-to-end source
mirrors the specification hierarchy where it realizes the same behavior.
Implementation tests remain colocated with source.

## Naming and readability

File names expose purpose:

| Suffix                     | Meaning                                      |
| -------------------------- | -------------------------------------------- |
| `*.spec.ts`                | Authoritative requirement specification      |
| `*.contract.spec.ts`       | Contract or conformance specification        |
| `*.implementation.test.ts` | Internal implementation verification         |
| `*.e2e.test.ts`            | End-to-end boundary execution                |
| `*.qualification.test.ts`  | Binary, installer, or platform qualification |
| `*.tooling.test.ts`        | Repository tooling verification              |
| `*.type-test.ts`           | Compile-time assertions                      |

Specification titles use product language and form a readable hierarchy:

```text
Install configured extensions
  when a configured extension is absent
    acquires the selected version
    records its accepted source and integrity
    realizes it for every configured agent
```

Specification titles describe conditions and observable results. They do not
name handlers, services, Layers, private functions, mock interactions, or
internal plan representations.

## Executable specification model

A thin, Vitest-compatible specification model provides stable specification
and scenario identities, requirement class, human-readable titles, scope
metadata, optional rationale, runner bindings, and reporting labels. It must
keep normative meaning visible and must not hide assertions behind an opaque
general-purpose DSL.

Specification implementations:

- exercise a public or application boundary;
- use deterministic in-memory ports rather than interaction-heavy mocks;
- control time, randomness, identifiers, concurrency, and filesystem state;
- use domain-named fixtures and builders;
- preserve parameterized cases as individually readable report entries;
- run shared conformance cases against in-memory and production adapters when
  their semantics must agree; and
- use snapshots only for stable, reviewable exact contracts.

Specification metadata can generate the reference catalog without requiring a
passing execution. Executing the same specification through an end-to-end
driver binds separate evidence to the same stable behavior identity.

## Completeness

The specification catalog defines what has been authored, but independent
executable inventories define completeness wherever possible. Completeness
gates compare specifications against sources such as:

- the command and help trees;
- the extension-type catalog;
- machine-output variants and error classes;
- ownership-unit and adapter registries;
- schemas and generated public contracts; and
- supported platform and distribution matrices.

Each inventory member either resolves to maintained specification coverage or
is explicitly outside the accepted requirements scope. Code coverage remains a
diagnostic measure and never substitutes for behavioral completeness.

## Execution and cadence

Repository commands expose intent rather than only package topology:

```text
pnpm test:spec
pnpm test:implementation
pnpm test:tooling
pnpm test:e2e
pnpm test:qualification
pnpm test
pnpm test:all
```

`test` runs the required fast suites. `test:all` includes end-to-end and
qualification evidence. Exact command composition remains repository-owned and
may add narrower targets such as `test:spec:memory` when useful.

The default cadence is:

- every change: in-memory specifications, implementation, tooling, and static
  verification;
- pull request or merge: risk-selected end-to-end scenarios;
- platform matrix or schedule: operating-system and runtime qualification;
- release: packaged binary, installer, upgrade, and smoke verification; and
- targeted or scheduled execution: performance, fuzzing, and resilience.

## Reporting

Reporting provides separate projections for:

1. authoritative specifications, with functional behavior as the primary
   product-shaped view and filters for every requirement class;
2. architecture verification;
3. implementation verification;
4. end-to-end and distribution qualification; and
5. tooling and static verification.

The primary functional view is organized by product meaning:

```text
Functional specifications
  CLI
    Install
      Install configured extensions
        when a configured extension is absent
          acquires and realizes the selected version
```

Each specification entry links to its source and shows its available in-memory,
end-to-end, qualification, and other evidence independently. Reports preserve
the execution revision, environment, timing, attachments, and retry or flaky
state.

Two linked projections serve different reader jobs:

- A generated specification catalog lists every authoritative requirement
  whether it executed, failed, or lacks a runner.
- Allure and CI reports describe executions of a particular implementation
  revision.

An aggregate passed-test count remains diagnostic but is not the primary
requirements-assurance statement. Missing, skipped, stale, or harness-failed
evidence never rolls up as a pass.

## Change control

Specification changes receive an explicit diff that identifies added, changed,
and removed requirements. A bug fix normally adds or strengthens a
specification before changing implementation. Reviewers distinguish a changed
requirement from a correction that makes implementation satisfy an unchanged
specification. Documentation changes cannot create, revise, retire, or replace
a requirement.

No permanent compatibility aliases or dual authorities are retained during the
pre-launch migration. Temporary overlap is permitted only within a bounded
migration slice and ends when that slice meets its cutover gate.
