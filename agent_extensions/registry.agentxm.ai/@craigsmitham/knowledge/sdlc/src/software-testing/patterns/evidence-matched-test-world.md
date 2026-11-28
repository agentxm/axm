---
type: Pattern
title: Evidence-matched test world
description: When choosing which components to run and which to substitute, keep the smallest setup in which a failure that matters would still be visible.
tags: [testing, test-fidelity, test-scope, test-doubles, integration, end-to-end, software-testing]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T02:14:03Z }
sources:
- id: google-unit-testing
  resource: https://abseil.io/resources/swe-book/html/ch12.html
  title: "Software Engineering at Google \u2014 Unit Testing"
- id: google-test-doubles
  resource: https://abseil.io/resources/swe-book/html/ch13.html
  title: "Software Engineering at Google \u2014 Test Doubles"
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
- id: istqb-risk
  resource: https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf
  title: ISTQB Certified Tester Foundation Level Syllabus v4.0.1
- id: google-larger-testing
  resource: https://abseil.io/resources/swe-book/html/ch14.html
  title: "Software Engineering at Google \u2014 Larger Testing"
- id: broad-stack-test
  resource: https://martinfowler.com/bliki/BroadStackTest.html
  title: Broad Stack Test
- id: aspnet-integration
  resource: https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0
  title: Integration tests in ASP.NET Core
- id: spring-mockmvc
  resource: https://docs.spring.io/spring-framework/reference/testing/mockmvc/vs-end-to-end-integration-tests.html
  title: "Spring Framework \u2014 MockMvc vs End-to-End Tests"
- id: prior-choosing-the-narrowest-effective-test
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-testing/src/choosing-the-narrowest-effective-test.md
  title: Choosing the narrowest effective test
- id: prior-designing-cross-boundary-and-end-to-end-tests
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-testing/src/designing-cross-boundary-and-end-to-end-tests.md
  title: Designing cross-boundary and end-to-end tests
---

# Evidence-matched test world

Suppose a CSV exporter passes its tests, but customers open the downloaded
file and see garbled names. A direct call can check which names the exporter
selects. To catch the reported failure the test must also read the bytes the
customer receives. If the download handler changes the encoding after export,
even a perfect test of the exporter will miss it.

## Problem, context, and forces

A test can pass while removing the condition that would falsify its claim.
Broader execution can restore fidelity while increasing cost, instability, and
diagnostic ambiguity. The useful choice balances fidelity, speed, isolation,
specificity, and predictiveness.[^google-unit-testing][^google-larger-testing][^test-desiderata]

## Response

Choose the smallest world that preserves every distinction material to the
claim and exposes a plausible contrary condition. The result serves a bounded
decision and risk, including failure, interruption, or recovery where relevant.
Risk-based effort reflects likelihood and impact, not automatic broad coverage
for every change.[^istqb-risk]

A changed file, route, declaration, or document does not itself need a new test.
Consumer-visible behavior and distinct regression risks justify evidence. A
second level earns its cost by covering a different risk. Executable
specifications address readable rules, examples, and evidence independently of
execution level; see [Executable specifications](executable-specifications.md).

## Separate the dimensions

Testing labels are overloaded. Do not infer scope from the runner or directory
name. These independent dimensions describe what a result can establish:

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

## Material boundaries

A causal path from stimulus to observable consequence can cross these boundaries:

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

## Representative worlds

Choose a world by the distinctions it preserves:

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

## Substitution contract

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

## Observation and control

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

## Narrow tests and contract suites

Write a unit test when logic can be exercised with plain inputs and observed
through return values, emitted events, or calls on an explicit collaborator.
For a wrapper that only delegates, look for a composed check that would
already fail if the wrapper broke. A route with its own error mapping adds
an observable decision. A focused case can earn its keep there.

### Contract suites

Use a dedicated suite when it is the comprehensive contract promised to a
consumer. Organize it by capabilities and observable outcomes, so a reader can
tell which promise a failing case breaks. When one interface has several
implementations, write the contract once as a shared suite and run it against
each implementation. Disagreement on a shared case exposes drift.
Behavior outside those cases still needs its own evidence.[^fowler-contract-test]

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
patching, call-count assertions, or mocking a large import graph. The substitution contract above applies to these seams.[^google-test-doubles][^fowler-test-double]

Signs that a substitution has gone wrong:

- the test asserts how many times a collaborator was called rather than what
  the subject produced;
- the substituted module is the one whose behavior the claim is about;
- the same fake is re-declared in many files with drifting behavior; or
- production has no seam and the test reaches in through the module system.

If substituting the dependency would hide the failure you care about, keep it
real. If substitution would preserve the claim, weigh a new production seam
against exercising the subject through an existing boundary.

## When a static check is enough

A schema check can identify an invalid package manifest before the build.
Use lint, schema, type, or build checks where the declaration itself settles
the question. If an installed command could be missing a file despite a
valid manifest, exercise the installed command. Its result answers a
different question about what reached the consumer.

## Consequences and related patterns

A narrower world often improves speed and diagnosis; every removed boundary is
also an evidence limit. A broader world is warranted when it restores a material
distinction. Review changed claims, dependencies, deployments, ownership,
runtime, and flakiness for lost or redundant evidence. A test whose claim has
disappeared or can no longer be discriminated has no coverage value merely by
remaining in the suite.

[Browser test evidence](../writing-browser-test-evidence.md) distinguishes
browser capability from subject scope. [Owned test worlds](owned-test-world.md)
helps decide who can restore a run when the selected world depends on shared
services or persistent state.

The name *evidence-matched test world* is this collection's synthesis. At
Google, teams record service traffic in a larger run and replay it for faster
checks. Changes in the live interaction still require the larger run.
Spring's MockMvc and ASP.NET Core's test host illustrate another realization:
framework request handling remains real while transport is substituted.
These accounts document different ways to preserve a distinction. The CSV
example is illustrative. The sources supply no comparison of how well this
description guides teams choosing their own boundaries.[^google-larger-testing][^spring-mockmvc][^aspnet-integration]

[^google-unit-testing]: Winters et al., [Unit Testing](https://abseil.io/resources/swe-book/html/ch12.html), describes why small, focused tests give fast and specific feedback and how to keep them maintainable.
[^test-desiderata]: Beck and Sutton, [Test Desiderata](https://testdesiderata.com/), presents valuable test properties as interacting aims rather than one universal test shape.
[^practical-test-pyramid]: Ham Vocke, [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html), distinguishes narrow integration checks from broad-stack tests and recommends controlled substitutes for remote systems.
[^fowler-contract-test]: Fowler, [Contract Test](https://martinfowler.com/bliki/ContractTest.html), describes running one contract against a substitute and the real collaborator to keep them aligned.
[^google-test-doubles]: Winters et al., [Test Doubles](https://abseil.io/resources/swe-book/html/ch13.html), distinguishes doubles and cautions against tests that validate only the behavior a mock author assumed.
[^fowler-test-double]: Fowler, [Test Double](https://martinfowler.com/bliki/TestDouble.html), defines the vocabulary of dummies, fakes, stubs, spies, and mocks.
[^istqb-risk]: ISTQB, [Certified Tester Foundation Level Syllabus v4.0.1](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf), section 5.2, defines product-risk analysis as a way to focus testing according to likelihood and impact.
[^google-larger-testing]: Graves, [Larger Testing](https://abseil.io/resources/swe-book/html/ch14.html), explains fidelity, system-under-test forms, ownership, hermeticity, data, and the costs of larger tests.
[^broad-stack-test]: Fowler, [Broad Stack Test](https://martinfowler.com/bliki/BroadStackTest.html), describes broad-stack scope as a continuum and notes that a UI is not required to exercise most of a system.
[^aspnet-integration]: Microsoft, [Integration tests in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0), documents application bootstrapping through `WebApplicationFactory` and an in-memory test server.
[^spring-mockmvc]: Spring, [MockMvc vs End-to-End Tests](https://docs.spring.io/spring-framework/reference/testing/mockmvc/vs-end-to-end-integration-tests.html), states which request-handling behavior MockMvc preserves and which live-container behavior it omits.
