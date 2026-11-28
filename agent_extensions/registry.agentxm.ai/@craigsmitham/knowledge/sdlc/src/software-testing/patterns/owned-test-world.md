---
type: Pattern
title: Owned test worlds
description: When a test leaves state behind or a failure crosses team boundaries, give someone responsibility for its setup, recovery, and diagnosis.
tags: [testing, ownership, isolation, readiness, cleanup, evidence, software-testing]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T02:14:03Z }
sources:
- id: google-larger-testing
  resource: https://abseil.io/resources/swe-book/html/ch14.html
  title: "Software Engineering at Google \u2014 Larger Testing"
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
  title: "Playwright \u2014 Projects"
- id: flaky-tests-google
  resource: https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
  title: Flaky Tests at Google and How We Mitigate Them
- id: prior-operating-cross-boundary-test-suites
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-testing/src/operating-cross-boundary-test-suites.md
  title: Operating cross-boundary test suites
---

# Owned test worlds

Two test runs leave reservations in the same queue. When a third run picks
one up, its output looks right even though its own request failed. Who can
tell which run produced the result, and who can clear the abandoned work
without disturbing a live run? This is a choice about operating a test whose
resources or effects extend beyond a single invocation.

## Problem and forces

A spanning test can fail without an accountable owner, leave state that poisons
later runs, or report a retry as though no failure occurred. Larger worlds need
representative state and observable readiness while remaining independently
selectable, diagnosable, and recoverable after interruption.

## Response

Give an identifiable person or team responsibility for the whole run and
the means to distinguish its work, recover its resources, and investigate
failures. A broker that removes an exclusive queue when its worker
disconnects can clear one run without disturbing others. With a persistent queue, give each
run its own address or filter so it only receives its own messages. Reclaim
abandoned messages once the owner can distinguish an expired run from one
still processing. A pure calculation with local inputs usually needs only
the ordinary ownership of its test code.

If the broker is incidental to the claim, first consider a smaller
[Evidence-matched test world](evidence-matched-test-world.md).

## Ownership

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

## State and lifecycle

The lifecycle identifies the exact system, environment, identity, seed state,
readiness condition, stimulus, public consequence, diagnostic capture, and
resource cleanup. Readiness must be observable. Cleanup includes interruption,
not only the successful end of a test.

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
freshness, artifacts, and meaning of success are explicit.

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

## Consequences and evidence

Explicit ownership and isolation improve attribution and repeatability at the
cost of harness and cleanup work. Shared environments limit destructive control
and early feedback; a fixture cannot promise isolation beyond the state it
actually owns. A team that adds a dedicated harness
to every local check takes on that maintenance even for checks with no
independent state to recover.

This collection proposes *Owned test worlds* as a candidate pattern. Graves reports
two ways Google makes test owners discoverable: repository ownership records
and annotations on individual tests. The Rails guide documents a different
part of the design. Parallel test processes get separate databases, and
disabling test transactions leaves the suite responsible for removing its
data. Together these sources support the ownership and isolation choices.
The queue scenario is an illustration. Outcomes from adopting the combined
pattern have yet to be documented here.[^google-larger-testing][^rails-testing]

[^google-larger-testing]: Graves, [Larger Testing](https://abseil.io/resources/swe-book/html/ch14.html), explains fidelity, system-under-test forms, ownership, hermeticity, data, and the costs of larger tests.
[^rails-testing]: Rails, [Testing Rails Applications](https://guides.rubyonrails.org/testing.html), distinguishes framework integration tests from browser-driven system tests and their cost and fidelity tradeoffs.
[^nx-react-template]: Nx, [React template](https://nx.dev/docs/templates/react), presents an application with a complementary Playwright E2E project as part of its workspace structure.
[^nx-playwright]: Nx, [Nx with Playwright](https://nx.dev/docs/technologies/test-tools/playwright/introduction), documents selecting Playwright during application generation and configuring it for an existing project.
[^playwright-projects]: Playwright, [Projects](https://playwright.dev/docs/test-projects), defines runner projects as logical test groups sharing configuration, such as browsers, environments, states, or subsets.
[^flaky-tests-google]: Micco, [Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html), reports the operational and decision costs of nondeterministic test results.
