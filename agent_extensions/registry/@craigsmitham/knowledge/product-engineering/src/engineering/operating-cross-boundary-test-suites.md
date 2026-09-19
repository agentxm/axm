---
type: Guide
title: Operating cross-boundary test suites
description: Use once a cross-boundary test world is chosen and the suite has to live somewhere; place the harness with one accountable owner, design seed state, readiness, and cleanup, bind execution to the decision point it can honestly serve, and keep failures attributable.
tags:
  [
    testing,
    end-to-end-testing,
    e2e,
    test-ownership,
    test-projects,
    test-data,
    test-isolation,
    flaky-tests,
    diagnostics,
    ci,
    monorepo,
    pe-engineering,
  ]
status: stable
sources:
  - id: google-larger-testing
    resource: https://abseil.io/resources/swe-book/html/ch14.html
    title: Software Engineering at Google — Larger Testing
  - id: rails-testing
    resource: https://guides.rubyonrails.org/testing.html
    title: Testing Rails Applications
  - id: nx-playwright
    resource: https://nx.dev/docs/technologies/test-tools/playwright/introduction
    title: Nx with Playwright
  - id: nx-react-template
    resource: https://nx.dev/docs/templates/react
    title: Nx React template
  - id: playwright-projects
    resource: https://playwright.dev/docs/test-projects
    title: Playwright — Projects
  - id: flaky-tests-google
    resource: https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
    title: Flaky Tests at Google and How We Mitigate Them
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Operating cross-boundary test suites

[Designing cross-boundary and end-to-end tests](designing-cross-boundary-and-end-to-end-tests.md)
settles what a suite must prove and which boundaries stay real. This guide
covers what happens next: where the harness lives, who is accountable for its
failures, how its state and readiness are designed, which decision point it
serves, and what evidence a failure must leave behind.

## Give the harness an honest owner

Project layout should reflect evidence ownership and lifecycle:

| Placement | Use when |
| --- | --- |
| **Collocated with the subject** | The framework-native harness is part of that subject's normal build and dependency context, with no independent orchestration or release concern. |
| **Complementary project for one deployable** | The harness has distinct dependencies, configuration, tasks, artifacts, or runtime lifecycle and primarily verifies one application. |
| **Feature-owned project or suite** | A large deployable has stable feature ownership and independent selection needs that are proven by scale, not anticipated. |
| **Cross-system project** | The claim spans deployables or teams and has an explicit owner responsible for the whole journey and its failures. |

Start with one complementary project per deployable when a distinct harness is
warranted. Split only when ownership, dependency boundaries, selection, or
execution scaling has become independently meaningful. Keep browser, device,
environment, or authentication variations in the runner's configuration unless
they truly have different semantic owners.

Nx's frontend templates illustrate the complementary-project pattern with an
application and a sibling E2E project, while its Playwright integration can
also configure an existing project. Playwright projects represent repeated
configurations and subsets within a harness. These are useful examples of the
distinction between **repository project ownership** and **test-runner matrix**,
not universal folder requirements.[^nx-react-template][^nx-playwright][^playwright-projects]

Give every spanning test one diagnosis owner even when several teams must help
repair the product. Cross-boundary tests without clear ownership tend to rot
because no single component owner can interpret the whole failure path.[^google-larger-testing]

## Design state and lifecycle as part of the test

A complete test contract includes:

1. obtain the exact system under test;
2. establish a known environment and identity;
3. create the minimum representative seed state;
4. wait for observable readiness;
5. perform the stimulus;
6. observe the public consequence and relevant contrary conditions;
7. capture diagnostic evidence; and
8. release resources or leave uniquely attributable data safe for later
   cleanup.

Prefer setup through stable domain or support APIs when their behavior belongs
to the scenario. Direct seeding is appropriate when it shortens setup without
erasing a boundary the claim depends on. Make generated identities unique and
record the seed or case identity needed to reproduce a failure.

Tests should not depend on the outcome of earlier tests. An intentionally
ordered workflow can live in one scenario or declare its sequence explicitly;
splitting it into order-dependent test cases creates misleading selection and
parallelism semantics. Rails, Google, and browser-framework guidance all expose
the same tradeoff: broader user workflows are valuable, but they cost more to
run, isolate, and maintain.[^rails-testing][^google-larger-testing]

Do not rely exclusively on teardown after success. Namespace test data,
constrain mutations, make cleanup idempotent, and plan for interruption so a
crashed worker does not poison later executions.

## Define execution and evidence semantics

Place each suite at the earliest decision point its world can faithfully
support:

| Decision point | Suitable evidence |
| --- | --- |
| Local change | Fast, isolated worlds with focused selection and useful local diagnosis |
| Change review | Representative cross-boundary claims affected by the change |
| Post-merge | Wider or slower worlds whose delay does not invalidate submission feedback |
| Pre-deployment | Built-artifact, configuration, and isolated-deployment claims |
| Post-deployment | Non-destructive probes and observations that only the live environment can answer |

Bind the suite to a repository task whose inputs, dependencies, environment,
freshness, artifacts, and meaning of success are explicit. Use [Designing a
coherent repository task interface](repository-task-interface.md) for those
execution-surface semantics.

A retry is another observation, not proof that the first failure was harmless.
Preserve attempt-level results and distinguish product failure, test defect,
environment failure, and unknown. At large scale, flaky signals consume
diagnostic attention and train teams to ignore legitimate failures.[^flaky-tests-google]

## Make failure attributable

On failure, retain the smallest safe evidence set that reconstructs the path:

- test identity, claim, case data, and seed;
- source, built artifact, deployment, and configuration identities;
- dependency and substitute versions;
- structured request, response, message, exit-status, or domain-event facts;
- lifecycle and readiness failures;
- logs and correlation identifiers from every owned boundary; and
- browser traces, screenshots, or console/network evidence when a browser is
  the observer.

Do not collect secrets, unbounded production data, or opaque bodies merely
because they might help. Prefer structured, redacted, attributable diagnostics
designed with the system.

## Northbank: own the allocation test world

For the [allocation case](northbank-allocation-change.md), the owning team
supplies a real-store world with isolated reservation histories, declared
schema/setup dependencies, readiness checks, and cleanup that survives a
failed test. The concurrency claim must observe committed application results.
The [task contract](northbank-engineering-system.md#give-tasks-one-observable-meaning)
identifies how local and CI callers start that world and what result freshness
means. A test that never ran because CI omitted it is an evidence gap, not a pass.

[^google-larger-testing]: Graves, [Larger Testing](https://abseil.io/resources/swe-book/html/ch14.html), explains fidelity, system-under-test forms, ownership, hermeticity, data, and the costs of larger tests.
[^rails-testing]: Rails, [Testing Rails Applications](https://guides.rubyonrails.org/testing.html), distinguishes framework integration tests from browser-driven system tests and their cost and fidelity tradeoffs.
[^nx-react-template]: Nx, [React template](https://nx.dev/docs/templates/react), presents an application with a complementary Playwright E2E project as part of its workspace structure.
[^nx-playwright]: Nx, [Nx with Playwright](https://nx.dev/docs/technologies/test-tools/playwright/introduction), documents selecting Playwright during application generation and configuring it for an existing project.
[^playwright-projects]: Playwright, [Projects](https://playwright.dev/docs/test-projects), defines runner projects as logical test groups sharing configuration, such as browsers, environments, states, or subsets.
[^flaky-tests-google]: Micco, [Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html), reports the operational and decision costs of nondeterministic test results.
