---
type: Architecture
status: stable
description: The testing architecture in which executable specifications are the sole local source of truth for AXM requirements and orthogonally classified verification provides complementary evidence.
depends-on:
  - ../overview.md
  - ../principles.md
  - ../decisions/colocated-specifications.md
---

# Testing strategy

Every accepted AXM requirement is a runnable, readable specification traced to
the product goal it supports; every change is judged by the evidence those
specifications produce; humans govern behavior at the specification layer
while implementation — human- or agent-written — changes freely beneath it;
and nothing else claims local requirements authority.

Executable specifications are therefore the sole local normative authority for
accepted requirements. Fast in-memory execution provides exhaustive evidence
for functional behavior, while other specification runners, boundary
executions, ordinary tests, artifact and static verification, and
diagnostic benchmarks provide evidence with different purposes, conditions,
cadences, and blind spots.

This document defines the active testing architecture.

## Outcomes

The testing architecture exists to enable one decision capability: any change
can be judged safe or unsafe on specification evidence alone, without tribal
knowledge or implementation archaeology. Because implementation is
increasingly written and rewritten by agents, the specification corpus is the
human control surface for AXM's behavior: review attention concentrates on the
small, product-shaped specification diff rather than the large implementation
diff, and specification readability is the property that keeps that control
real rather than nominal.

To support that decision, the architecture must make two views equally clear:

- A reader can navigate executable specifications as the requirements reference
  for AXM, moving from a product surface, quality, constraint, or public
  contract to a specific scenario and expected result.
- A maintainer can tell whether a test specifies supported behavior, verifies
  non-normative internal details, exercises an end-to-end boundary, verifies an
  artifact, informs a release decision, measures a trend, or protects repository
  tooling.

The specification catalog covers every accepted AXM requirement. Its fast
in-memory subset aims to cover all supported functional behavior. That is
behavioral coverage against an explicit product inventory, not a claim about
line or branch coverage.

Each specification traces to the product goal it supports. A requirement whose
motivating goal has lapsed becomes a retirement candidate rather than being
preserved automatically, keeping the corpus a living contract instead of a
ratchet of accidental behavior.

## Authority

Executable specification source — the `*.spec.ts` files that live beside the
source they govern, discovered across every authored project — is the sole
local source of truth for what AXM is required to do, achieve, preserve,
prevent, or constrain, across every review lens of the shared contract: functional,
quality, constraint, external-conformance, human-factors, and process. A
specification on `main` is accepted; merging the change that adds, revises, or
removes it is the acceptance decision, and the predecessor it supersedes is
retired in the same change, so one obligation is never normative in two
places. Executing a specification against an implementation produces evidence
about whether the implementation satisfies it. A result or report never
changes the specification.

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

The metadata contract, classification lens, controlled vocabularies, and
shared product-goal identities are defined once in `@agentxm/extension-model`
and consumed by every AgentXM specification corpus
([Shared specification contract](../decisions/shared-specification-contract.md)).
An obligation that more than one repository could claim is allocated to one
corpus; the other side specifies only its own conformance to a named contract
version and never restates the obligation.

## Product-goal registry

Product goals are registered, not free text. A small product-goal registry
records the product outcomes and capabilities AXM serves, each with a stable
identity and a short statement of the outcome it names. Specification metadata
references goal identities; the registry does not restate, own, or rank the
requirements that support a goal.

Two completeness-style gates keep the traceability live: a specification that
references a retired goal is a retirement candidate, and a registered goal
with no referencing specification identifies either missing coverage or a dead
goal. Requirements review walks goals rather than specifications, asking
whether each registered outcome is still wanted and still sufficiently
specified. That review — never implementation convenience — is what retires
requirements.

## Classification model

Tests and checks are classified on independent axes instead of one flat test
taxonomy.

| Axis      | Common values or examples                                                                                                                                                                              | Question answered                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Purpose   | `specification`, `architecture-verification`, `internal`, `tooling`, `artifact-verification`, `diagnostic`                                                                                             | What authority or claim does it support?                      |
| Concern   | The shared review lens: functional, quality (with a named characteristic such as installability, compatibility, performance, or security), constraint, external-conformance, human-factors, or process | What kind of property is assessed?                            |
| Role      | `experience`, `interface`, `supporting`                                                                                                                                                                | How does the requirement participate in the product contract? |
| Boundary  | `memory`, `process`, `binary`, `packed-artifact`, `installed`, `platform`, `published-artifact`, `deployed`                                                                                            | Where does the observation occur?                             |
| Method    | Extensible; for example `example`, `property`, `model`, `contract`, `measurement`, `load`, or `smoke`                                                                                                  | How is the claim assessed?                                    |
| Subject   | Surface, capability, public contract, package, environment, or implementation unit                                                                                                                     | What does the assessment concern?                             |
| Selection | Per change, platform matrix, scheduled, release candidate, or post-deployment                                                                                                                          | When is this evidence selected?                               |

Class, role, boundary, and selection are closed vocabularies owned by the
shared contract. Method and characteristic are extensible: method metadata
describes the approach a test actually uses, and new or combined testing
methods do not require a contract change before they can be used. Common
labels are normalized only when that improves filtering and reporting without
erasing a meaningful distinction.

Role is independent of concern. Experience requirements describe behavior
meaningful to a person or agent completing an AXM task. Interface requirements
state public machine-consumable contracts. Supporting requirements state
subordinate system or engineering obligations. A requirement has one primary
role; independently promised experience and interface behavior is split rather
than hidden behind a reporting tag. Non-normative implementation detail remains
internal verification rather than a supporting requirement.

Concern describes the requirement or quality characteristic rather than a
physical suite. Selection describes execution policy and may include one test
in several workflows; it never changes the test's authority. Boundary names the
state actually observed, so a packed-artifact or installed-product execution is
not automatically a different kind of requirement.

End-to-end is a boundary, not a competing authority. An in-memory scenario and
an end-to-end scenario may execute the same specification through different
drivers. A test is a specification when it states a rule someone could have
decided differently, in language a stakeholder can accept or reject, and
carries a declared identity and statement. Protecting a supported public
contract is necessary for that but not sufficient: a contract suite that
exhaustively exercises an interface is evidence, not an obligation. Release
verification is a gate that selects evidence for an exact candidate, not a test
purpose or source tree.

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

Quality, constraint, external-conformance, human-factors, and process
requirements use the same authoritative metadata contract and stable identity
as functional behavior while retaining their native, purpose-fit test
frameworks and methods. An obligation that cannot run — a human-factors or
manually observed claim — is still a specification: it declares `manual` or
`review` as its method, and the harness reports it as unverified rather than
passing. They may use performance measurement,
static analysis, schema checks,
dependency analysis, security tooling, platform matrices, or other runners and
may execute at a slower cadence. Their execution method does not move their
normative statement into documentation, runner configuration, or a report.

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

Structural relationships and design decisions that are not actor-visible
behavior are normally engineering policy, enforced natively by the adopted
tooling and verified by ordinary tests: package dependency direction, feature
isolation, acyclicity, application-only composition, entry-point composition,
ownership-unit registration, generated contract coherence, and adapter
participation are all of that kind. They do not become requirements merely
because they are checked, and they report in the verification projection.

A structural constraint becomes a constraint-class specification only when it
carries standing outside the repository — an obligation someone outside
engineering could accept or reject, such as the public system depending only on
published contracts, or end-to-end evidence observing only shipped artifacts.
Those report with the other authoritative specifications, and the static gate
that verifies one binds its result to the requirement identity rather than
owning the requirement.

### Internal verification

Internal verification protects non-normative details of the current
realization: algorithms, private state machines, parsers, collaboration,
resource lifetimes, concurrency primitives, and difficult internal failure
paths. These tests are colocated with the source they protect and may change or
disappear during a behavior-preserving refactor.

`Internal` describes the authority of the assertion. It does not mean secret
or private repository content, and it does not identify code visibility, an
execution boundary, or a test method. Internal tests do not count toward
specification completeness, and private symbol names or call relationships do
not appear in the functional reference.

If an internal assertion is discovered to express behavior or a constraint AXM
is required to preserve, move the normative claim into an executable
specification. Retain an internal test only when it supplies distinct
white-box evidence rather than a duplicate source of truth.

### Tooling verification

Tooling tests protect repository scripts, generators, release automation, and
test infrastructure. Public library utilities use functional specifications
for supported contracts and internal tests for non-normative realization
details.

### Installed-product and platform evidence

Installation, update, upgrade, and removal behavior belongs to functional or
installability specifications. Supported operating systems, runtime versions,
filesystems, shells, and other environment combinations belong to compatibility
specifications. These requirements remain in the product-shaped specification
tree while their executions observe the binary, packed-artifact, installed, or
platform boundary.

Conformance is used when AXM adopts an identified public contract, format,
protocol, or external standard. It is not a synonym for testing AXM on a
platform or deciding whether a release is acceptable.

### Artifact and supply-chain verification

Artifact verification inspects package contents, metadata, permissions,
signatures, checksums, integrity, and provenance. A required artifact property
is stated as a specification and the check provides evidence for it. Other
artifact checks remain supporting release or supply-chain evidence and do not
become requirements merely because they block publication.

Artifact provenance establishes where and how an artifact was produced. It
does not by itself establish functional correctness, security, or requirement
satisfaction.

### Release and deployment verification

Release verification evaluates an exact release candidate by composing the
specification executions and supporting checks required by release policy. It
may include risk-selected end-to-end scenarios, compatibility matrices,
artifact verification, install/update/uninstall flows, performance
specifications, and smoke checks. The applicable process specification or
release policy owns the selection and acceptance criteria. The gate only
applies that policy and projects its decision input; it does not own the
criteria or tests it selects.

Deployment verification applies a small selection of specifications and
supporting smoke checks after deployment or against an externally integrated
environment. `Smoke` describes deliberately shallow coverage and cadence; it
does not establish a separate authority or replace broader specification
evidence.

### Performance specifications and benchmarks

A performance specification states a required latency, throughput, resource,
scalability, or other measurable bound together with the material workload and
conditions. It produces a pass, fail, or unknown requirement outcome and runs
in a controlled environment appropriate to the bound.

A benchmark measures implementation behavior for comparison, optimization, or
regression diagnosis without establishing a required threshold. Benchmark
completion is not a specification pass. When a benchmark threshold becomes a
required product property, express that obligation as a performance
specification and retain the benchmark only when it supplies distinct trend
evidence.

Load, stress, soak, and resilience describe methods or operating conditions.
Each may realize a normative specification or a diagnostic experiment; the
method name alone does not decide its authority.

The per-change in-memory suite uses deterministic functional invariants rather
than noisy wall-clock thresholds. Cheap deterministic performance constraints
may run per change; environment-sensitive thresholds run in controlled CI or
scheduled environments, with broader diagnostic benchmarks scheduled or
invoked for targeted optimization work.

### Static verification

Type checking, linting, Effect diagnostics, architecture-boundary enforcement,
generated-artifact consistency, source hygiene, and schema validation remain
first-class verification gates. They are reported separately from runtime
behavioral tests. When one of these gates satisfies a requirement, it binds its
result to the authoritative specification identity instead of owning the
requirement itself.

## Physical organization

A specification lives beside the source it governs, inside the project that
owns that source, and is discovered from the Nx project graph rather than from
a directory list:

```text
packages/{core,supporting}/<package>/src/**/*.spec.ts   package-owned requirements
apps/cli/src/**/*.spec.ts                               grammar, prompts, rendering, exit codes
apps/cli-e2e/src/**/*.e2e.test.ts                       process- and binary-boundary evidence
scripts/**/*.test.ts                                    repository automation
benchmarks/**/*.bench.ts                                diagnostic measurement

specifications/catalog.md                               generated reading path
specifications/product-goals.ts                         local product-goal registry
specifications/disposition-ledger.json                  explanations for removed identities
```

Location carries no authority. Identity does: a requirement is named by its
stable identity, declared in metadata, and a move preserves it. Because
identity is independent of path, a specification travels with the code it
governs when a responsibility moves between packages, and the verdict renders
that as a move rather than a removal and an addition
([Colocated specifications](../decisions/colocated-specifications.md)).

The generated catalog supplies the semantic browsing hierarchy the directory
tree no longer does: it organizes requirements by their role in the product
contract, then by primary product goal, then by review class, and names the
owning project beside each entry. Ordinary tests are colocated with their
source the same way, and end-to-end evidence binds to the identity it
witnesses rather than mirroring a hierarchy.

## Naming and readability

File names expose purpose:

| Suffix           | Meaning                                             |
| ---------------- | --------------------------------------------------- |
| `*.spec.ts`      | Authoritative requirement specification             |
| `*.test.ts`      | Non-normative ordinary test colocated with source   |
| `*.e2e.test.ts`  | End-to-end boundary execution, only in e2e projects |
| `*.type-test.ts` | Compile-time assertions                             |
| `*.bench.ts`     | Non-normative diagnostic benchmark                  |

Purpose beyond that comes from metadata and project tags, not from a longer
suffix. Source hygiene enforces the three rules the table implies: a
`*.spec.ts` exports exactly one valid `specification` with an identity no other
file claims, a `*.test.ts` never exports specification metadata, and a
`*.e2e.test.ts` lives only in an `role:e2e` project.

An installability or compatibility specification remains `*.spec.ts` even when
it runs against a packed artifact or platform matrix. Boundary, method, and
selection metadata provide those filters without creating suffix combinations
for every axis.

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

Readability is verified, not aspired to. Specification titles lint against
implementation symbol inventories so handler, service, Layer, and private
function names cannot enter the reference. The generated catalog rendering of
a changed specification is part of its review: a specification whose catalog
entry does not read as a product requirement fails review regardless of its
assertions.

## Specification metadata contract and native frameworks

Specification tests use idiomatic constructs from their native test framework
and any purpose-fit testing library. The shared metadata contract in
`@agentxm/specification-metadata` provides only the cross-method information that
discovery, conformance, and reporting need: a stable requirement identity, a
human-readable title, the normative statement, class and role, the product
goals the requirement supports, the observation boundary and its
rationale, methods, lineage (`derivedFrom`, `supersedes`), stated assumptions
and open questions, and declared limitations with retirement conditions.
Unknown assumptions or open questions are stated as unknown, never omitted.

The contract is data, not a specification DSL. It does not replace or wrap
native suites, tests, assertions, hooks, fixtures, lifecycle, parameterization,
property generators, models, or control flow. Given/When/Then and other
scenario conventions are available when they improve a particular example but
are never required. A specification remains directly runnable, debuggable, and
navigable through its native framework and development tools.

The requirement title and source organization provide the readable reference
path. Native tests are the reportable scenarios; properties, models,
parameters, steps, attachments, and assertions provide their precise
executable meaning. Metadata neither duplicates native test titles nor becomes
a prose-only substitute for those checks.

Within the fast functional subset, specification tests normally:

- exercise a public or application boundary;
- use deterministic in-memory ports rather than interaction-heavy mocks;
- control time, randomness, identifiers, concurrency, and filesystem state;
- use domain-named fixtures and builders;
- preserve parameterized cases as individually readable report entries;
- run shared conformance cases against in-memory and production adapters when
  their semantics must agree; and
- use snapshots only for stable, reviewable exact contracts.

A specification inherits the production boundary of the project that owns it.
There is no shared harness: a package's specifications drive that package's own
application API, and the deterministic implementations they run against are the
`./testing` exports its dependencies publish — in-memory filesystem, controlled
clock, identifiers, and transition lock. Files, lock ownership, configuration,
and injected failures belong to the scenario rather than the worker, and file
and test order is shuffled to make state leakage visible. Shared
adapter-contract tests compare each in-memory port with its live counterpart,
so the substitution is itself evidenced; process, native-lock,
atomic-replacement, callback-transport, and artifact executions remain separate
boundary evidence in the end-to-end project.

Because every owner runs specifications and ordinary tests through its own
`test` target, purpose is labelled per file at execution rather than by suite
membership: a `.spec.ts` that did not run under specification labelling, or
whose evidence is missing, stale, skipped, filtered, or partial, is never a
pass.

Reporter adapters normalize native framework results into the specification
catalog, Allure, and CI projections. They consume test results without
controlling how tests are authored. Supporting a new testing method should
require at most metadata normalization or a reporting adapter, not a redesign
of the specification contract.

Specification metadata can generate the reference catalog without requiring a
passing execution. Executing the same specification through an end-to-end or
other boundary-specific driver binds separate evidence to the same stable
requirement identity.

## Completeness

The specification catalog defines what has been authored, but independent
executable inventories define completeness wherever possible. Completeness
gates compare specifications against sources such as:

- the command and help trees;
- the extension-type catalog;
- machine-output variants and error classes;
- ownership-unit and adapter registries;
- schemas and generated public contracts; and
- supported platform, runtime, and artifact matrices.

Each inventory member either resolves to maintained specification coverage or
is explicitly outside the accepted requirements scope. Code coverage remains a
diagnostic measure and never substitutes for behavioral completeness.

The command tree shows the approach in full. An independently enumerated route
table — every registered command node, groups included — is compared with
three sources at once: the interaction capabilities each node declares, the
flags its parser actually accepts, and the `preview-is-pure` requirement
identity each preview route resolves to through the catalog. A node without a
declaration, a
declared capability with no matching flag, a flag with no declared purpose, or
a preview route without its purity evidence fails the gate. The declaration
states expectations, the parsed grammar proves exposure, and the purpose
specifications prove effect; none of the three is trusted alone.
[Interaction](../commands/interaction.md) explains the contract the table
enforces.

Completeness gates measure breadth; specification strength measures depth.
Mutation testing runs as a diagnostic: a surviving mutant maps to a
requirement whose evidence could not detect a behavior change and therefore
cannot support a change verdict on its own. Strength results are diagnostic
evidence, not requirement outcomes, and never substitute for reviewing what a
specification means.

## Execution and cadence

Repository commands expose intent rather than only package topology:

```text
pnpm test
pnpm test:all
pnpm test:spec
pnpm test:e2e
pnpm test:compatibility
pnpm test:performance
pnpm verify:artifact
pnpm verify:release
pnpm verify:deployment
pnpm bench
```

`test` runs every project's own `test` target, so specifications and ordinary
tests execute together with their source. `test:spec` selects specifications by
identity, class, or characteristic: it resolves each selection to the projects
that own the matching files and runs those projects' native targets, so
selection needs no central test project.

`test:compatibility` and `test:performance` select authoritative
specifications; they do not own parallel specification trees. `verify:artifact`
and `verify:deployment` compose applicable specifications and supporting checks
for identified artifacts or environments. `verify:release` composes the
required evidence for one exact release candidate. `bench` runs diagnostic
measurements separately from pass/fail specification execution.

`test:all` adds broadly executable slower boundary and specification selections
but does not pretend to verify a release candidate or deployment when no exact
artifact or environment is supplied. Exact command composition remains
repository-owned.

Specifications are also execution targets for agent-performed implementation.
Selection by stable requirement identity — for example
`pnpm test:spec --requirement <id>` — lets a task run exactly the evidence for
the requirement it implements, and specification failure output stays in
product language so a failing specification corrects an implementer's
understanding of the requirement rather than only pointing at code.

The default cadence is:

- every change: in-memory specifications, ordinary tests, and static
  verification;
- pull request or merge: risk-selected end-to-end scenarios;
- platform matrix or schedule: compatibility specifications against supported
  operating systems and runtimes;
- controlled targeted or scheduled execution: performance specifications,
  fuzzing, load, soak, and resilience;
- scheduled execution: diagnostic benchmark trends;
- release candidate: `verify:release` over the exact candidate artifact; and
- post-deployment: shallow deployment verification against the identified
  environment.

## Reporting

Reporting provides separate projections for:

1. authoritative specifications — every class of the shared lens — organized
   by requirement role, with product behavior as the primary reading path and
   filters for requirement concern and execution boundary;
2. diagnostic architecture checks, internal, tooling, and static verification,
   visibly separated by purpose and method;
3. artifact integrity, contents, and provenance verification;
4. diagnostic benchmark trends;
5. release and deployment verification views that compose rather than own the
   underlying results; and
6. a per-change verdict for one proposed change: the requirement diff — added,
   changed, and removed identities rendered in product language from the
   catalog — together with the evidence status of every affected requirement.

The per-change verdict is the primary human review surface for a change. A
reviewer reads the requirement diff as a requirements decision and the
affected-requirement evidence as its supporting proof; missing or stale
evidence appears in the verdict rather than silently narrowing it.

The internal verification projection is organized primarily by package and
source location because its reader job is maintaining the current realization,
not understanding AXM's normative behavior.

The primary specification view is organized first by requirement role, then by
product meaning:

```text
Product behavior
  CLI — Install
    Install configured extensions
      when a configured extension is absent
        acquires and realizes the selected version

Programmatic interfaces
  CLI — Install
    Machine install output is one complete schema-backed plan document

Supporting system behavior
  System — Process
    Changes are verified by one aggregate required check before merge
```

Each specification entry links to its source and shows its available in-memory,
process, binary, packed-artifact, installed, platform, published-artifact,
deployed, and other evidence independently. Reports preserve the execution
revision, exact artifact identity, environment, timing, attachments, and retry
or flaky state.

Each execution receipt also identifies its runtime mode. A source-mode receipt
binds freshness to the executed TypeScript sources and can be produced from a
disposable checkout with no compiled package output. A built-mode receipt binds
freshness to both source and package runtime artifacts. Skipped, pending,
filtered, interrupted, incomplete, input-changing, and stale executions retain
their existing non-passing semantics in either mode.

Performance specification reports also preserve workload, hardware, operating
system, runtime, configuration, dataset, warm-up, sampling, variance, and
threshold context needed to interpret a pass or failure. Benchmark reports use
the same provenance but present trends and comparisons separately from
requirement outcomes.

Two linked projections serve different reader jobs:

- A generated specification catalog lists every authoritative requirement
  whether it executed, failed, or lacks a runner.
- Allure and CI reports describe executions of a particular implementation
  revision.

An aggregate passed-test count remains diagnostic but is not the primary
requirements-assurance statement. Missing, skipped, stale, or harness-failed
evidence never rolls up as a pass.

A release verification report identifies the exact candidate and the evidence
selection policy it applied. Passing that gate does not strengthen the
underlying results, fill missing specification coverage, or make release policy
a second requirements authority.

## Change control

Specification changes receive an explicit diff that identifies added, changed,
and removed requirements. A bug fix normally adds or strengthens a
specification before changing implementation. Reviewers distinguish a changed
requirement from a correction that makes implementation satisfy an unchanged
specification. Retirement is as deliberate as addition: when a requirement's
motivating goal lapses, the specification is reviewed for retirement through
the same governed diff rather than kept because it exists. Documentation
changes cannot create, revise, retire, or replace a requirement.

The specification layer is governed asymmetrically. Implementation-scoped work
— human- or agent-performed — treats `*.spec.ts` files as read-only wherever
they live; changing a specification is a distinct requirements task. Repository
controls enforce the asymmetry: CODEOWNERS routes every `*.spec.ts` to
maintainer approval as a requirements decision regardless of which package it
sits in, and a change that touches both specifications and implementation is
reviewed as a requirements change, never waved through as a refactor. Review
tooling surfaces the direction of a specification diff — deleted cases,
loosened assertions, widened tolerances — so a weakened requirement is visible
as a weakening, not just a change.

No permanent compatibility aliases or dual authorities are retained during the
pre-launch migration. Temporary overlap is permitted only within a bounded
migration slice and ends when that slice meets its cutover gate.
