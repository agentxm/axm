---
type: Guide
title: Choosing the narrowest effective test
description: Use when a change needs executable evidence and no material risk yet requires a real cross-boundary or browser world; admit the test deliberately, choose the narrowest level that observes the claim, substitute collaborators through explicit seams, and keep repository conventions out of tests.
tags:
  [
    testing,
    unit-testing,
    contract-testing,
    spec-tests,
    shared-specs,
    integration-testing,
    test-doubles,
    fakes,
    mocks,
    test-architecture,
    test-levels,
    test-pyramid,
    convention-enforcement,
    pe-engineering,
  ]
status: draft
sources:
  - id: google-unit-testing
    resource: https://abseil.io/resources/swe-book/html/ch12.html
    title: Software Engineering at Google — Unit Testing
  - id: google-test-doubles
    resource: https://abseil.io/resources/swe-book/html/ch13.html
    title: Software Engineering at Google — Test Doubles
  - id: practical-test-pyramid
    resource: https://martinfowler.com/articles/practical-test-pyramid.html
    title: The Practical Test Pyramid
  - id: fowler-test-double
    resource: https://martinfowler.com/bliki/TestDouble.html
    title: Test Double
  - id: fowler-contract-test
    resource: https://martinfowler.com/bliki/ContractTest.html
    title: Contract Test
  - id: test-desiderata
    resource: https://testdesiderata.com/
    title: Test Desiderata
generated: { by: claude/fable-5.1, at: 2026-09-02T18:30:00Z }
---

# Choosing the narrowest effective test

Use this guide before adding or changing a test whose subject is logic, a
module contract, or one collaborator boundary. It is the narrow end of the
test-architecture ladder. When a material risk crosses several components,
processes, services, stores, artifacts, or deployment configuration, continue
with [Designing cross-boundary and end-to-end
tests](designing-cross-boundary-and-end-to-end-tests.md). When the unresolved
risk is browser rendering or interaction, continue with [Choosing
browser-dependent interface
tests](choosing-browser-dependent-interface-tests.md). When a test must also be
the authoritative statement of intent that non-authors read and dispute,
continue with [Designing executable
specifications](designing-executable-specifications.md); a contract suite is
comprehensive coverage of an interface, which is a separate property from
authority over a rule.

The goal is evidence that a consumer-visible contract holds, obtained at the
cheapest level that can still contradict the claim. Narrow tests are fast,
specific, and easy to diagnose, but each substitution they make can erase a
distinction the claim depends on. Fidelity, speed, isolation, and
predictiveness trade against one another rather than improving
together.[^google-unit-testing][^test-desiderata]

## Desired outcomes

A good narrow-test architecture produces:

- **Deliberate admission** — every test names a contract or regression risk
  that needs executable evidence.
- **One assertion home** — each behavior is proved once at the cheapest
  trustworthy level, and higher levels add only distinct risks.
- **Honest substitution** — every replaced collaborator is a declared,
  contract-faithful seam rather than an intercepted module or patched global.
- **Consumer-facing contracts** — comprehensive suites are organized by what a
  consumer can observe, not by implementation structure.
- **Conventions elsewhere** — mechanically decidable repository rules live in
  lint, schema, type, or build checks, not in test runners.

## Admit a test deliberately

Add a test when a consumer-visible contract or a distinct regression risk needs
executable evidence. Do not add one because a file, route, export,
configuration object, or document changed. A test that restates a declaration
fails on harmless reorganization and proves nothing the declaration did not
already say.

Before writing, state:

1. **Claim** — the observable behavior that should hold, under which
   conditions.
2. **Contrary condition** — the plausible departure that must make the test
   fail.
3. **Cheapest observer** — the narrowest subject and world in which that
   departure is visible.

If the contrary condition is invisible without a real store, process, protocol,
artifact, or browser, the narrow ladder does not fit. Use the cross-boundary or
browser guide instead of widening a narrow test until it passes.

## Choose the narrowest level that observes the claim

Move down this list only until the claim becomes observable:

| Level | Choose it when | It does not establish |
| --- | --- | --- |
| **Unit test** | Logic branches independently of infrastructure, a reusable primitive has a stable public contract, or a broader failure would be slow or hard to diagnose | Collaboration across a real boundary |
| **Contract suite** | A complete consumer-facing module contract deserves one comprehensive suite organized by capability and observable outcome | Behavior of any collaborator the suite substitutes |
| **Narrow integration test** | One real collaborator boundary matters: a database, filesystem, network client, transaction, or framework host | Whole-path behavior across several boundaries |
| **Cross-boundary or browser test** | A material risk spans boundaries or depends on browser capability; see the companion guides | Anything the declared world replaces |

Assert each behavior once at the cheapest trustworthy level. A second level
needs a distinct risk, not a desire for repetition. Narrow integration tests
exercise the application through its interface; they do not inspect tables,
migration text, or provider configuration as a substitute for
behavior.[^practical-test-pyramid]

### Unit tests

Write a unit test when logic can be exercised with plain inputs and observed
through return values, emitted events, or calls on an explicit collaborator.
Skip a direct unit test for route-local composition, static copy, declarative
configuration, or a wrapper that adds no behavior. Those subjects are proved by
the composed contract they participate in or by a type or build check.

### Contract suites

Use a dedicated suite when it is the comprehensive contract promised to a
consumer. Organize it by capabilities and observable outcomes, so a reader can
tell which promise a failing case breaks. When one interface has several
implementations, write the contract once as a shared suite and run it against
each implementation. A shared suite is what keeps an in-memory implementation
honest against the real one.[^fowler-contract-test]

### Narrow integration tests

Keep one boundary real and substitute the rest. Use the repository's declared
test store, migrations, and fixtures rather than an ad hoc schema, and drive
the subject through its public interface. Give the test its own uniquely
identifiable data so it can run in any order and be cleaned up after
interruption.

## Substitute through explicit seams

Supply clocks, identifiers, clients, repositories, filesystems, and other
capabilities through the same service or function boundaries production uses.
Prefer a small contract-faithful fake over module interception, global
patching, call-count assertions, or mocking a large import graph. A fake is
trustworthy only when its behavior is understood and checked against the real
collaborator; an unvalidated double lets a test pass confidently against an
invented contract.[^google-test-doubles][^fowler-test-double]

Signs that a substitution has gone wrong:

- the test asserts how many times a collaborator was called rather than what
  the subject produced;
- the substituted module is the one whose behavior the claim is about;
- the same fake is re-declared in many files with drifting behavior; or
- production has no seam and the test reaches in through the module system.

When a seam is missing, add it to the subject rather than to the test.

## Keep conventions out of tests

Do not use a test runner to scan source files, Markdown, exports, directories,
workflow definitions, or package metadata for required or forbidden structure.
Mechanically decidable conventions belong in lint rules, repository quality
scripts, schema validation, typechecking, or build checks. Those tools report
the violation where it occurs, run in the right decision point, and do not
inflate a behavioral suite with structural ceremony.

## Completion check

Before admitting a new or changed narrow test, confirm:

- [ ] The claim, contrary condition, and cheapest observer are explicit.
- [ ] The test sits at the lowest level that can contradict the claim.
- [ ] No higher level already proves the same behavior without a distinct risk.
- [ ] Every substituted collaborator enters through an explicit seam and has a
      known relationship to the real one.
- [ ] A contract suite is organized by consumer-observable outcome, and a
      shared contract runs against every implementation.
- [ ] Any narrow integration test uses the declared test store and unique,
      cleanable data.
- [ ] The test proves behavior, not repository structure or declarations.

If any material risk still requires a real boundary or a browser, continue with
the companion guides and complete their admission checks.

[^google-unit-testing]: Winters et al., [Unit Testing](https://abseil.io/resources/swe-book/html/ch12.html), describes why small, focused tests give fast and specific feedback and how to keep them maintainable.
[^test-desiderata]: Beck and Sutton, [Test Desiderata](https://testdesiderata.com/), presents valuable test properties as interacting aims rather than one universal test shape.
[^practical-test-pyramid]: Ham Vocke, [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html), distinguishes unit tests, narrow integration tests, and broad-stack tests and recommends testing through public interfaces.
[^fowler-contract-test]: Fowler, [Contract Test](https://martinfowler.com/bliki/ContractTest.html), describes running one contract against a substitute and the real collaborator to keep them aligned.
[^google-test-doubles]: Winters et al., [Test Doubles](https://abseil.io/resources/swe-book/html/ch13.html), distinguishes fakes, stubs, and mocks and cautions against tests that validate only the behavior a mock author assumed.
[^fowler-test-double]: Fowler, [Test Double](https://martinfowler.com/bliki/TestDouble.html), defines the vocabulary of dummies, fakes, stubs, spies, and mocks.
