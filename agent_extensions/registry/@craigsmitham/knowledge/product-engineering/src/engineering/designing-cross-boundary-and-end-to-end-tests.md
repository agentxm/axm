---
type: Guide
title: Designing cross-boundary and end-to-end tests
description: Use when a material risk spans components, processes, services, storage, artifacts, or deployment configuration; separate claim scope from boundary reality and execution distance, then select the smallest representative test world and observation surface that still discriminates the claim.
tags:
  [
    testing,
    end-to-end-testing,
    e2e,
    system-testing,
    integration-testing,
    broad-stack-testing,
    test-architecture,
    test-fidelity,
    test-doubles,
    claim-scope,
    monorepo,
    pe-engineering,
  ]
status: stable
sources:
  - id: istqb-risk
    resource: https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf
    title: ISTQB Certified Tester Foundation Level Syllabus v4.0.1
  - id: google-larger-testing
    resource: https://abseil.io/resources/swe-book/html/ch14.html
    title: Software Engineering at Google — Larger Testing
  - id: google-test-doubles
    resource: https://abseil.io/resources/swe-book/html/ch13.html
    title: Software Engineering at Google — Test Doubles
  - id: broad-stack-test
    resource: https://martinfowler.com/bliki/BroadStackTest.html
    title: Broad Stack Test
  - id: practical-test-pyramid
    resource: https://martinfowler.com/articles/practical-test-pyramid.html
    title: The Practical Test Pyramid
  - id: test-desiderata
    resource: https://testdesiderata.com/
    title: Test Desiderata
  - id: aspnet-integration
    resource: https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0
    title: Integration tests in ASP.NET Core
  - id: spring-mockmvc
    resource: https://docs.spring.io/spring-framework/reference/testing/mockmvc/vs-end-to-end-integration-tests.html
    title: Spring Framework — MockMvc vs End-to-End Tests
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Designing cross-boundary and end-to-end tests

Use this guide when the evidence you need depends on behavior crossing a real
boundary: components wired together, a protocol, process lifecycle, persistent
storage, a queue, an installed artifact, deployment configuration, or more than
one service. Use [Choosing browser-dependent interface
tests](choosing-browser-dependent-interface-tests.md) when the unresolved risk
is specifically browser rendering or interaction, and [Designing executable
specifications](designing-executable-specifications.md) when the test must also
be the authoritative statement of intent that non-authors read and dispute.

The goal is not to maximize realism. It is to create the **smallest test world
that preserves every distinction material to the claim**, produces a useful
contrary signal, and remains economical enough to trust and maintain. Larger
tests exist to close fidelity gaps, but fidelity, isolation, speed, specificity,
and predictiveness pull against one another.[^google-larger-testing][^test-desiderata]

## Desired outcomes

A good cross-boundary test architecture produces:

- **Claim-bearing evidence** — every test names the behavior and risk its
  result bears on.
- **Deliberate fidelity** — real and substituted boundaries are choices, with
  their accepted differences visible.
- **Useful failure** — a failure says which path or boundary contradicted the
  claim and preserves enough evidence to investigate it.
- **Independent execution** — tests can be selected, repeated, reordered, and
  parallelized unless an ordered sequence is itself the declared scenario.
- **Stable ownership** — the deployable, feature, integration, or system that
  owns the evidence also owns its lifecycle and diagnosis.
- **Proportionate feedback** — expensive worlds are reserved for risks that
  cheaper worlds cannot faithfully observe.
- **Replaceable machinery** — project layout, runners, containers, and
  frameworks implement the evidence contract without defining its meaning.

Risk-based testing focuses effort according to likelihood and impact rather
than treating every behavior and configuration as equally deserving of the
most expensive test.[^istqb-risk]

## Separate the dimensions

Testing labels are overloaded. Do not infer scope from the runner or directory
name. Describe a test on at least these dimensions:

| Dimension | Question | Example values |
| --- | --- | --- |
| **Claim scope** | What behavior and causal path does the result cover? | One function, component, application, workflow, multi-service journey |
| **Boundary reality** | Which production boundaries remain real? | In-process dispatch, real serialization, live database, real subprocess, substituted third party |
| **Execution distance** | How is the system obtained? | Imported module, framework test host, local processes, installed artifact, isolated deployment, shared environment |
| **Observation and control** | How is it driven and observed? | Direct call, HTTP client, message client, CLI, browser, external probe, human evaluation |

This yields combinations that names alone often hide:

| | Narrow claim scope | Broad claim scope |
| --- | --- | --- |
| **Non-browser observer** | A module or adapter test | An API-, CLI-, worker-, or message-driven system test |
| **Browser observer** | A component, rendering, or interaction test | A browser-driven cross-boundary journey |

A browser test is therefore not necessarily end-to-end. Conversely, a test can
exercise most of a system through a service or command interface without using
a browser. Broad-stack testing is a continuum, and its UI is only one possible
entrypoint.[^broad-stack-test]

Use **end-to-end** only with a declared start and a declared end. “From the public
HTTP request through persistence,” “from the installed command through its
output artifact,” and “from browser navigation through the application-owned
backend” are meaningful scopes. “Tests everything” is not.

## Design the evidence contract

### 1. Start with the decision, risk, and claim

Write four statements before choosing a runner:

1. **Decision:** what will this result permit or prevent?
2. **Risk:** what material failure could cross the boundary?
3. **Claim:** what observable behavior should hold, under which conditions?
4. **Contrary condition:** what plausible departure must make the test fail?

Include success, boundary, failure, interruption, and recovery conditions when
they materially change the decision. Do not turn an example count, coverage
percentage, or existing regression into an automatic mandate for a broad test.

### 2. Trace the minimum causal path

List the path from stimulus to observable consequence. Mark each boundary and
the failure it could introduce:

| Boundary | Distinctions a cheaper world might erase |
| --- | --- |
| Framework dispatch | Routing, middleware order, binding, validation, filters, error mapping |
| Serialization or protocol | Wire names, encoding, headers, status, framing, compatibility |
| Process lifecycle | Startup, shutdown, signals, environment, working directory, readiness |
| Persistent store | Real schema, transactions, constraints, queries, locking, migrations |
| Asynchronous work | Scheduling, acknowledgment, retry, ordering, eventual visibility |
| Service integration | Authentication, protocol contract, timeout, partial failure, version skew |
| Built or installed artifact | Packaging, omitted files, executable permissions, resolution, runtime dependencies |
| Deployment | Configuration binding, routing, identity, platform limits, asset and network behavior |

Retain a boundary only when its real behavior is necessary to discriminate the
claim. Replace the rest deliberately. A double is useful when its behavior is
understood and checked against the real collaborator; an unvalidated double can
make a test confidently green against an invented contract.[^google-test-doubles]

### 3. Choose the smallest representative test world

Move down this ladder only until the claim becomes observable:

| Test world | Preserves | Commonly omits |
| --- | --- | --- |
| Direct or composed in-process execution | Application logic and selected real collaborators | Host lifecycle, transport, packaging, deployment |
| Framework-native test host | Framework wiring, dispatch, rendering or serialization | Real server/container and network behavior |
| Live local process set | Process startup, real transport, local services | Installed/deployed topology and shared-platform behavior |
| Built or installed artifact | Packaging and runtime resolution | Deployment control plane and production topology |
| Isolated deployment | Deployment configuration and realistic topology | Shared traffic and production-only integrations |
| Shared staging or production observation | Actual shared environment | Hermeticity, early feedback, safe destructive control |

Framework-native tests are not “less real” in the abstract. ASP.NET Core can
bootstrap the application with an in-memory test server, and Spring MockMvc can
exercise framework request handling without a live server; each preserves
substantial behavior while omitting specific host and network distinctions.
Those omissions determine whether the world fits the claim.[^aspnet-integration][^spring-mockmvc]

If two worlds answer different risks, keep both. Do not make the broadest world
repeat all detailed cases already proved more specifically; use a small number
of representative cross-boundary examples to establish the integration claim.

### 4. Declare every real and substituted boundary

For each dependency, record:

- whether it is real, fake, simulated, recorded, or unavailable;
- which behavior the substitute must preserve;
- how compatibility with the real dependency is checked;
- which failures the world can and cannot reveal; and
- who owns drift between the substitute and reality.

Prefer a controlled local or isolated instance for application-owned
dependencies when their implementation matters. Prefer a substitute plus
contract evidence for third-party systems unless the decision genuinely needs
a safe provider-owned test environment. Broad tests against uncontrolled third
parties commonly add latency and instability without creating accountable
evidence.[^practical-test-pyramid][^google-larger-testing]

### 5. Select the control and observation surface

Choose the surface that exposes the user- or consumer-visible claim while
preserving the necessary path:

- public API or protocol for service behavior;
- command invocation and resulting output, state, and exit status for a CLI;
- message publication and observable downstream effect for an asynchronous
  workflow;
- browser interaction for browser-dependent consequences; or
- an external probe for a deployed availability or routing claim.

Use internal probes only when the claim itself is internal or when they provide
diagnostic evidence without replacing the public outcome. A test that drives a
public surface but proves success only through private state can miss a broken
consumer-visible response.

## Own, run, and diagnose the suite

Once the world and observation surface are chosen, [Operating cross-boundary
test suites](operating-cross-boundary-test-suites.md) owns the rest: harness
placement and diagnosis ownership, seed state, readiness, cleanup and
interruption, the decision point each suite serves, and the evidence a failure
must retain.

## Review and retire deliberately

Review a test when its claim, boundary, dependency, deployment, or ownership
changes, or when runtime and flakiness alter its decision value. Ask:

- Does this risk still require these real boundaries?
- Has a narrower test or contract check made the broad test redundant?
- Has the world drifted from the supported deployment?
- Does the failure remain attributable to an owner?
- Is the suite still early and reliable enough for its decision point?
- Would one representative scenario now provide the same evidence as several?

Retire tests whose claim is gone, duplicated, or no longer discriminated. Do
not retain them as ceremonial “coverage.”

## Completion check

Before admitting a new or materially widened cross-boundary suite, confirm:

- [ ] The decision, risk, claim, and contrary condition are explicit.
- [ ] Both ends and every necessary boundary of the claimed path are named.
- [ ] The selected world is the smallest one that preserves those distinctions.
- [ ] Real and substituted dependencies, drift checks, and blind spots are declared.
- [ ] The control and observation surface matches the consumer-visible claim.
- [ ] Project placement reflects one accountable semantic owner.
- [ ] State, readiness, interruption, cleanup, and parallel execution are designed.
- [ ] The repository task exposes inputs, environment, freshness, artifacts, and result meaning.
- [ ] Failures retain safe, attributable diagnostics; retries remain visible.
- [ ] Review and retirement triggers are identified.

If the unresolved reason for the test is browser behavior, continue with
[Choosing browser-dependent interface
tests](choosing-browser-dependent-interface-tests.md). If no material risk
requires a real boundary, use the narrower test architecture instead.

## Northbank: preserve the relevant failure boundary

In the [allocation case](northbank-allocation-change.md), a real store is
necessary to challenge the selected concurrency mechanism. A separate test
world can interrupt publication after commit and redeliver the occurrence to
an idempotent consumer. A provider emulator can expose unknown authorization
and retry behavior, but cannot establish the real provider's availability or
transaction guarantees. State which boundary is real and why each additional
world earns its cost.

[^istqb-risk]: ISTQB, [Certified Tester Foundation Level Syllabus v4.0.1](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf), section 5.2, defines product-risk analysis as a way to focus testing according to likelihood and impact.
[^google-larger-testing]: Graves, [Larger Testing](https://abseil.io/resources/swe-book/html/ch14.html), explains fidelity, system-under-test forms, ownership, hermeticity, data, and the costs of larger tests.
[^test-desiderata]: Beck and Sutton, [Test Desiderata](https://testdesiderata.com/), presents valuable test properties as interacting aims rather than one universal test shape.
[^broad-stack-test]: Fowler, [Broad Stack Test](https://martinfowler.com/bliki/BroadStackTest.html), describes broad-stack scope as a continuum and notes that a UI is not required to exercise most of a system.
[^google-test-doubles]: Winters et al., [Test Doubles](https://abseil.io/resources/swe-book/html/ch13.html), distinguishes doubles and cautions against tests that validate only the behavior a mock author assumed.
[^aspnet-integration]: Microsoft, [Integration tests in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0), documents application bootstrapping through `WebApplicationFactory` and an in-memory test server.
[^spring-mockmvc]: Spring, [MockMvc vs End-to-End Tests](https://docs.spring.io/spring-framework/reference/testing/mockmvc/vs-end-to-end-integration-tests.html), states which request-handling behavior MockMvc preserves and which live-container behavior it omits.
[^practical-test-pyramid]: Ham Vocke, [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html), distinguishes narrow integration checks from broad-stack tests and recommends controlled substitutes for remote systems.
