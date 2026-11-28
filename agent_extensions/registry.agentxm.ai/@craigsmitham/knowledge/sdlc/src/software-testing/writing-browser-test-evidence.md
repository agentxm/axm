---
type: Reference
title: Browser test evidence
description: Defines browser capability and scope choices, observable assertions, readiness, isolation, visual baselines, accessibility limits, and failure evidence.
tags:
  [
    testing,
    browser-testing,
    locators,
    test-isolation,
    synchronization,
    page-objects,
    test-matrix,
    responsive-design,
    visual-regression-testing,
    accessibility-testing,
    flaky-tests,
    diagnostics,
    software-testing,
  ]
status: stable
generated: { by: codex/gpt-6, at: 2026-11-11T20:13:01Z }
sources:
- id: playwright-best-practices
  resource: https://playwright.dev/docs/best-practices
  title: "Playwright \u2014 Best Practices"
- id: playwright-projects
  resource: https://playwright.dev/docs/test-projects
  title: "Playwright \u2014 Projects"
- id: playwright-fixtures
  resource: https://playwright.dev/docs/test-fixtures
  title: "Playwright \u2014 Fixtures"
- id: playwright-visual
  resource: https://playwright.dev/docs/test-snapshots
  title: "Playwright \u2014 Visual comparisons"
- id: playwright-accessibility
  resource: https://playwright.dev/docs/accessibility-testing
  title: "Playwright \u2014 Accessibility testing"
- id: cypress-isolation
  resource: https://docs.cypress.io/app/core-concepts/test-isolation
  title: "Cypress \u2014 Test Isolation"
- id: selenium-practices
  resource: https://www.selenium.dev/documentation/test_practices/
  title: "Selenium \u2014 Test Practices"
- id: selenium-state
  resource: https://www.selenium.dev/documentation/test_practices/encouraged/avoid_sharing_state/
  title: "Selenium \u2014 Avoid sharing state"
- id: testing-library-queries
  resource: https://testing-library.com/docs/queries/about/
  title: "Testing Library \u2014 About Queries"
- id: wai-evaluation
  resource: https://www.w3.org/WAI/test-evaluate/
  title: "W3C WAI \u2014 Evaluating Web Accessibility Overview"
- id: ui-flaky-tests
  resource: https://arxiv.org/abs/2103.02669
  title: An Empirical Analysis of UI-based Flaky Tests
- id: cypress-testing-types
  resource: https://docs.cypress.io/app/core-concepts/testing-types
  title: "Cypress \u2014 Testing Types"
- id: storybook-testing
  resource: https://storybook.js.org/docs/writing-tests
  title: "Storybook \u2014 How to test UIs with Storybook"
- id: jsdom
  resource: https://github.com/jsdom/jsdom/blob/main/README.md
  title: jsdom README
- id: prior-choosing-browser-dependent-interface-tests
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-testing/src/choosing-browser-dependent-interface-tests.md
  title: Choosing browser-dependent interface tests
---

# Browser test evidence

Browser evidence concerns rendering, interaction, accessibility, and platform
behavior. A browser component test can preserve interface fidelity while
substituting the rest of the application; a browser is not automatically an
end-to-end observer. The [Evidence-matched test world](patterns/evidence-matched-test-world.md)
pattern owns the general fidelity and substitution tradeoff.

## Required capabilities

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

## Subject scope

Subject scope is independent of browser capability:

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

## Prefer user-facing control and observation

Choose the most meaningful stable public or deliberate testing contract for
the claim: accessible role/name, label or visible text, a named region or route,
or a dedicated test identifier. Accessible queries and explicit contracts avoid
incidental DOM shape, generated classes, and styling hooks; selector choice is
contextual, not a universal hierarchy.[^testing-library-queries][^playwright-best-practices]

Assert the observable outcome, not merely that the action ran. For example,
assert the new accessible state, rendered content, focus destination, geometry,
URL, or persisted reader-visible effect that would contradict the claim.

## Synchronize on meaning, not time

Wait for an observable readiness or outcome condition:

- a control becomes actionable;
- a response or domain result is rendered;
- focus reaches the intended element;
- animation reaches the state relevant to the claim;
- a request completes and its consequence appears; or
- the application exposes an explicit readiness signal.

Do not use fixed sleeps to approximate readiness. Runner actionability and
retry behavior remove some races, but they do not define application-specific
readiness or prove the intended outcome.[^playwright-best-practices]

## Isolate all state the browser can observe

Each test should receive a known browser context, identity, application state,
and data namespace unless shared state is an explicit part of one scenario.
Reset or uniquely scope cookies, storage, caches, workers, permissions,
downloads, and server data that can influence the result. Know exactly what the
runner resets; a fresh page alone is not a fresh system.

Playwright fixtures and browser contexts, Cypress test isolation, and
Selenium's fresh-driver and no-shared-data recommendations all pursue
independent results, while differing in precise reset behavior.[^playwright-fixtures][^cypress-isolation][^selenium-state]

Programmatic setup is appropriate when logging in or navigating through
prerequisite UI is not part of the claim. Keep at least the evidence needed for
the real authentication or navigation boundary elsewhere when it remains a
material risk.

## Keep abstractions semantic and diagnosable

Extract fixtures, component drivers, or page-level helpers when they:

- name a stable product interaction;
- centralize lifecycle and cleanup;
- preserve useful assertion and locator diagnostics; or
- keep test intent visible while absorbing runner mechanics.

Avoid wrappers that turn scenarios into an opaque private language, hide
waiting, swallow failure details, or couple all tests to one large page object.
Selenium describes its test practices as contextual guidelines rather than
universal prescriptions; abstraction should solve observed maintenance and
diagnostic costs.[^selenium-practices]

## Design a risk-shaped matrix

Treat these as independent dimensions:

- browser engine or branded browser;
- operating system, device, fonts, and rendering environment;
- viewport and pixel density;
- pointer, keyboard, touch, and other input;
- color scheme, contrast, motion, zoom, and text scaling;
- locale, writing direction, content length, and translated text;
- anonymous, authenticated, authorized, and persisted state; and
- application or deployment configuration.

A representative default supports general functional evidence. Focused or
pairwise variations cover dimensions that can change a material outcome;
full supported-environment sweeps serve compatibility claims that require them.
Usage, incidents, and support commitments inform matrix changes. A Cartesian
product is not automatically a useful coverage target.

Runner projects or profiles are suitable for repeated configuration and test
subsets. They do not, by themselves, require separate repository projects or
copies of the suite.[^playwright-projects]

For responsive behavior, test semantic transitions and consequences around
meaningful layout states, not an arbitrary catalog of device names. Add a
viewport when it exercises a distinct composition, input, or overflow risk.

## Treat visual evidence as its own contract

Use pixel or image comparison when visual appearance itself is the
discriminating outcome and a structural assertion would miss the departure.
For every baseline, define:

- the component, region, or page and state represented;
- browser, operating system, fonts, viewport, scale, and rendering mode;
- ownership and review criteria for accepting a new baseline;
- which dynamic content is controlled, masked, or excluded and why; and
- the threshold or comparison method and the departures it may hide.

Browser rendering can vary with environment, browser version, hardware, and
settings; Playwright recommends generating and comparing screenshots in the
same environment.[^playwright-visual] A screenshot artifact is diagnostic
evidence unless a declared comparison and oracle evaluate it. A changed image
is not automatically a defect, and approving all changed baselines is not a
test.

Prefer focused visual claims over whole-page snapshots when the broader pixels
add unrelated churn. Retain whole-page comparison when composition across the
page is itself the risk.

## Bound accessibility conclusions

Layer accessibility evidence according to the question:

| Evidence | Can support | Cannot alone support |
| --- | --- | --- |
| Semantic component or DOM assertions | Names, roles, relationships, states represented in markup | Real focus movement, visual presentation, assistive-technology behavior |
| Browser interaction tests | Keyboard paths, focus, visibility, interaction, browser-computed consequences | Complete WCAG conformance or usability |
| Automated rule scans | Violations detectable by the rules in the scanned states | Violations requiring judgment or unvisited states |
| Expert manual assessment | Wider conformance and interaction judgment within declared scope | Every user and assistive-technology experience |
| Evaluation with disabled users | Barriers and usability evidence for represented participants and contexts | Universal conclusions or standards conformance by itself |

Both W3C WAI and Playwright state that automated tooling cannot determine full
accessibility; combine automated checks with knowledgeable human assessment and
inclusive user evaluation for broader conclusions.[^wai-evaluation][^playwright-accessibility]

An accessible query improves semantic alignment but is not an accessibility
certification. Conversely, a necessary test identifier does not itself make an
interface inaccessible.

## Preserve actionable diagnostics

On failure, retain enough safe evidence to reproduce the browser state:

- scenario and configuration identity;
- browser and engine version, operating system, viewport, input, locale, and
  relevant preferences;
- application artifact, deployment, and data identity;
- trace or ordered actions with timing and readiness facts;
- console errors and bounded network request/response metadata;
- DOM or accessibility snapshot when relevant;
- screenshot or video around the failure; and
- every retry result, not only the final attempt.

UI flakiness has diverse causes and operating conditions, while UI tests are
costlier to rerun repeatedly than small tests. Treat nondeterminism as evidence
to diagnose rather than a reason to normalize retries as success.[^ui-flaky-tests]

Classify failures as product, test, environment, or unknown only from retained
evidence. Quarantine can protect an unrelated decision path temporarily, but
must preserve visibility, ownership, and a route to repair or retirement.

[^testing-library-queries]: Testing Library, [About Queries](https://testing-library.com/docs/queries/about/), prioritizes accessible, user-corresponding queries.
[^playwright-best-practices]: Playwright, [Best Practices](https://playwright.dev/docs/best-practices), recommends user-visible behavior, isolated tests, resilient locators, actionability checks, controlled data, and deliberate browser coverage.
[^playwright-fixtures]: Playwright, [Fixtures](https://playwright.dev/docs/test-fixtures), documents isolated test fixtures, browser contexts, composed setup and teardown, and worker-scoped resources.
[^cypress-isolation]: Cypress, [Test Isolation](https://docs.cypress.io/app/core-concepts/test-isolation), documents independent-test expectations and the exact browser state Cypress resets or retains.
[^selenium-state]: Selenium, [Avoid sharing state](https://www.selenium.dev/documentation/test_practices/encouraged/avoid_sharing_state/), recommends independent data and a fresh driver for each test.
[^selenium-practices]: Selenium, [Test Practices](https://www.selenium.dev/documentation/test_practices/), deliberately frames its material as contextual guidelines and recommendations rather than universal best practices.
[^playwright-projects]: Playwright, [Projects](https://playwright.dev/docs/test-projects), defines projects as logical groups for browsers, devices, environments, state, and test subsets.
[^playwright-visual]: Playwright, [Visual comparisons](https://playwright.dev/docs/test-snapshots), documents environment-dependent rendering, named baselines, comparison thresholds, and snapshot updates.
[^wai-evaluation]: W3C WAI, [Evaluating Web Accessibility Overview](https://www.w3.org/WAI/test-evaluate/), states that tools assist evaluation but knowledgeable human evaluation is required for an accessibility determination.
[^playwright-accessibility]: Playwright, [Accessibility testing](https://playwright.dev/docs/accessibility-testing), distinguishes automatically detectable issues from manual assessment and inclusive user testing.
[^ui-flaky-tests]: Romano et al., [An Empirical Analysis of UI-based Flaky Tests](https://arxiv.org/abs/2103.02669), analyzes causes and remediation of flaky UI tests across web and Android projects.

[^jsdom]: jsdom, [README](https://github.com/jsdom/jsdom/blob/main/README.md), explicitly identifies navigation and layout as outside its implemented scope.
[^storybook-testing]: Storybook, [How to test UIs with Storybook](https://storybook.js.org/docs/writing-tests), describes browser-rendered component tests with controlled context and mocked dependencies.
[^cypress-testing-types]: Cypress, [Testing Types](https://docs.cypress.io/app/core-concepts/testing-types), distinguishes component, API, accessibility, and browser-to-backend E2E testing and their tradeoffs.
