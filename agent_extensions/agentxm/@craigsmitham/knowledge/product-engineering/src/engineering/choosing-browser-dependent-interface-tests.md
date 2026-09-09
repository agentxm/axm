---
type: Guide
title: Choosing browser-dependent interface tests
description: Use when an interface claim may depend on real browser rendering, interaction, accessibility, or platform behavior; state the observable claim, name the browser capability that alone reveals it, and admit the narrowest scope — from DOM-emulated component to deployed journey — that keeps the risk visible.
tags:
  [
    testing,
    browser-testing,
    interface-testing,
    ui-testing,
    component-testing,
    end-to-end-testing,
    e2e,
    accessibility-testing,
    cross-browser-testing,
    browser-admission-gate,
    playwright,
    cypress,
    selenium,
    pe-engineering,
  ]
status: stable
sources:
  - id: cypress-testing-types
    resource: https://docs.cypress.io/app/core-concepts/testing-types
    title: Cypress — Testing Types
  - id: storybook-testing
    resource: https://storybook.js.org/docs/writing-tests
    title: Storybook — How to test UIs with Storybook
  - id: jsdom
    resource: https://github.com/jsdom/jsdom/blob/main/README.md
    title: jsdom README
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Choosing browser-dependent interface tests

Use this guide after identifying an interface risk whose observable consequence
might require a real browser. Its goal is to **admit the least costly test
environment that faithfully exposes that consequence**, and to fix the test's
subject scope independently of that decision.

Browser-dependent does not mean end-to-end. A component rendered in a browser
can provide high-fidelity interface evidence while substituting the rest of the
application. A browser-driven journey becomes cross-boundary or end-to-end only
when its declared claim spans those boundaries. Use [Designing cross-boundary
and end-to-end tests](designing-cross-boundary-and-end-to-end-tests.md) for the
system world, ownership, service dependencies, data, and lifecycle of such a
journey. Use [Designing executable
specifications](designing-executable-specifications.md) when the test must also
be the authoritative statement of intent that non-authors read and dispute;
browser mechanics never belong in that text.

## Desired outcomes

A good browser-testing architecture produces:

- **Browser necessity** — every browser test names a browser-only risk that a
  cheaper observer cannot faithfully reveal.
- **Smallest faithful scope** — component, route, application, and deployed
  journey tests are chosen independently of the browser requirement.
- **Reader-visible assertions** — tests observe semantics and consequences
  rather than irrelevant DOM or stylesheet structure.
- **Risk-shaped matrices** — browsers, platforms, viewports, preferences, and
  inputs vary only where a plausible difference could change the conclusion.
- **Layered accessibility evidence** — automated checks, interaction tests,
  expert evaluation, and user research make claims no broader than their
  methods support.
- **Stable visual evidence** — screenshots have a declared purpose, controlled
  baseline identity, and accountable review.
- **Actionable failure** — traces and environment facts distinguish product,
  test, and infrastructure failures without hiding retries.

## Apply the browser admission gate

### 1. Name the observable interface claim

State what a reader or operator must perceive or be able to do, under which
conditions, and what visible departure must fail the test. Examples include:

- a control receives focus and remains visible after keyboard navigation;
- content reflows without clipping at a supported narrow viewport;
- an overlay is positioned above and receives pointer input instead of the
  obscured element;
- navigation changes the document and history as promised;
- a platform API, storage mechanism, font, or image affects the rendered
  consequence; or
- an engine-specific implementation produces a supported result.

“The page looks right,” “the component changed,” and “we want confidence” are
not yet discriminating claims.

### 2. Identify the required browser capability

A real browser is warranted when the contrary condition depends materially on
capabilities such as:

| Capability | Risks it can reveal |
| --- | --- |
| Layout and rendering | Geometry, wrapping, clipping, overflow, stacking, fonts, replaced content |
| Hit testing and scrolling | Obscured controls, pointer target, sticky behavior, scroll position |
| Focus and native interaction | Sequential focus, focus restoration, native controls, keyboard and pointer behavior |
| CSS and media evaluation | Cascade consequences, computed values, breakpoints, color scheme, reduced motion, forced colors |
| Navigation and origin behavior | History, redirects, document replacement, cookies, storage, security boundaries |
| Browser APIs and scheduling | Observers, workers, clipboard, media, animation, event timing, platform capability |
| Engine or platform implementation | Compatibility differences among supported engines, operating systems, fonts, and devices |

A DOM implementation can be appropriate for markup, accessible naming, event
contracts, or framework rendering, but it does not automatically provide real
layout, navigation, or browser-platform behavior. jsdom, for example,
explicitly omits layout and full navigation.[^jsdom]

If removing the browser would not erase the distinction the test must detect,
use the cheaper observer.

### 3. Choose scope separately from capability

Select the narrowest subject that still exhibits the risk:

| Test form | Choose it when | It does not establish |
| --- | --- | --- |
| **Pure or server-side test** | The claim is logic, data, generated markup, or request/response behavior | Browser rendering or interaction |
| **DOM-emulated component test** | DOM semantics and framework state are enough; layout and platform behavior are irrelevant | Real geometry, navigation, engine behavior |
| **Browser component test** | A component needs real rendering or interaction but can receive controlled props, context, and dependencies | Application routing, backend, or deployment behavior |
| **Browser route/application test** | Routing, page composition, browser storage, or application wiring matters; remote dependencies can be controlled | Substituted backend or deployment boundaries |
| **Browser-driven cross-boundary test** | The claim spans browser, application, and necessary live boundaries | Any dependency that the declared world replaces |
| **Human or assistive-technology evaluation** | Usability, visual judgment, or accessibility cannot be decided by the automated observer | Exhaustive conformance or population-wide experience |

Storybook's browser component model demonstrates that real-browser interaction
can remain scoped to one UI unit with mocked dependencies. Cypress likewise
distinguishes component, API, accessibility, and E2E modes. Tool taxonomies
vary, but the capability/scope separation remains portable.[^storybook-testing][^cypress-testing-types]

### 4. Test the consequence at the owning layer

Assign each interface fact one semantic owner:

- a token, rule, or component contract owns its definition;
- a focused browser test owns browser resolution or binding when that cannot be
  established statically;
- a route or application test owns the reader-visible consequence of composed
  interface behavior; and
- an end-to-end journey owns only the cross-boundary outcome that requires the
  whole path.

Do not repeat the same literal at every layer. A browser test should not assert
stylesheet source text when the risk is a computed or visible result, and an
E2E journey should not duplicate every component state merely because it can
reach them.

## Write the admitted test

Once a browser test is admitted and scoped, [Writing browser test
evidence](writing-browser-test-evidence.md) owns how it is written: locator and
assertion choice, readiness conditions, browser and application state
isolation, semantic abstractions, the environment matrix, visual baselines,
accessibility conclusions, and failure diagnostics.

## Review and retire deliberately

Review a browser test when its interface claim, supported environments,
component boundary, dependency world, or observed failure modes change. Ask:

- Does the contrary condition still require a browser?
- Can a narrower browser component test now provide the same evidence?
- Can a non-browser test preserve every material distinction?
- Does the matrix still correspond to supported users and observed risks?
- Does the assertion track a user-visible contract or incidental structure?
- Are baseline changes and accessibility conclusions reviewed at the right
  authority?
- Does failure evidence still lead to an accountable owner?

Move a test down when the browser no longer contributes necessary evidence.
Widen it only when a newly identified browser or cross-boundary risk requires
the wider world.

## Completion check

Before admitting a new or materially widened browser test, confirm:

- [ ] The reader-visible claim and contrary condition are explicit.
- [ ] At least one named browser capability is necessary to reveal the risk.
- [ ] The subject scope is independent of the decision to use a browser.
- [ ] The test observes the consequence at its semantic owner and avoids duplicate literal assertions.
- [ ] Locators and assertions use stable user-facing or deliberate testing contracts.
- [ ] Readiness, browser state, application state, and data are isolated or explicitly sequenced.
- [ ] Matrix dimensions are risk-selected rather than exhaustively multiplied.
- [ ] Visual baselines, if any, have controlled identity and accountable review.
- [ ] Accessibility conclusions do not exceed the evidence method.
- [ ] Failures retain configuration, trace, browser, and retry evidence.
- [ ] A review or retirement trigger is known.

If the browser is only the driver for a wider system claim, also complete the
admission check in [Designing cross-boundary and end-to-end
tests](designing-cross-boundary-and-end-to-end-tests.md).

[^jsdom]: jsdom, [README](https://github.com/jsdom/jsdom/blob/main/README.md), explicitly identifies navigation and layout as outside its implemented scope.
[^storybook-testing]: Storybook, [How to test UIs with Storybook](https://storybook.js.org/docs/writing-tests), describes browser-rendered component tests with controlled context and mocked dependencies.
[^cypress-testing-types]: Cypress, [Testing Types](https://docs.cypress.io/app/core-concepts/testing-types), distinguishes component, API, accessibility, and browser-to-backend E2E testing and their tradeoffs.
