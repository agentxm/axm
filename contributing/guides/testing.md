---
status: active
last-reviewed: 2026-04-03
version: 0.2.0
description: "When writing or reviewing tests. Covers test levels, placement, quality criteria, and Effect testing patterns."
depends-on: []
---

# Testing Guide

Principles and guidelines for writing effective tests. After reading, you should
be able to choose the right test type for a given concern, write tests that
verify behavior rather than implementation details, and avoid common testing
anti-patterns.

> [Testing](../../CLAUDE.md#testing) — workflow and quality checklist

**Not covered:** Performance testing, load testing, or CI/CD pipeline
configuration.

## Key Resources

- [Vitest Documentation](https://vitest.dev/) — Test runner API and configuration
- [Effect Testing](https://effect.website/docs/testing) — Testing Effect programs
- [Workspace State](./workspace-state.md) — Add receipt-metamorphic and per-type parity tests for reconciliation changes

## Skills

| Skill                                                                           | Command | Description                                        |
| ------------------------------------------------------------------------------- | ------- | -------------------------------------------------- |
| [axm-testing-e2e](../../.claude/skills/axm-testing-e2e/SKILL.md)                | —       | E2E test patterns for CLI commands                 |
| [effect-testing](../../.axm/extensions/@axm/skills/effect-testing/src/SKILL.md) | —       | Effect testing with @effect/vitest                 |
| [effect-service](../../.axm/extensions/@axm/skills/effect-service/src/SKILL.md) | —       | Service patterns including test layer construction |

---

## Core Principles

1. **Test runtime behavior, not source artifacts.** If the assertion breaks when
   a file is renamed or a config key is reordered — without any change in
   runtime behavior — it is convention enforcement, not testing.
2. **Choose the lowest effective test level.** Assert each behavior once at the
   cheapest level that produces a clear, trustworthy signal.
3. **Prefer explicit seams over mocks.** Supply collaborators through
   constructor or function injection. Avoid module mocking, global patching, and
   call-order assertions.
4. **No structural auditing in tests.** Conventions belong in linters or
   static-analysis steps. See
   [Convention Enforcement Is Not Testing](#convention-enforcement-is-not-testing).
5. **Every test failure should point to a behavioral regression.** If it
   doesn't, the test erodes confidence instead of building it.
6. **Resolve property tensions deliberately.** Fast vs predictive, specific vs
   broad — choose the tradeoff intentionally. See
   [Properties in Tension](#properties-in-tension).

---

## Before Writing a Test

Ask: **does this assertion verify runtime behavior?** A test earns its place
when it exercises code that runs and asserts on what the system _does_. If not,
the test suite is not the right home for it. Common traps:

- **Static source artifacts** — config objects, schema descriptions, layout
  trees. Test the _effect_ of the policy, not the structure that encodes it.
- **Declarative code** — modules that declare configuration or metadata do not
  need tests that restate the same declaration in assertion form. Test the
  consumer-visible effect, or the external contract when that contract is itself
  the product.

### Avoid Mocks, Prefer Constructor Injection

If a test is hard to write without `vi.mock`, import interception, or global
patching, treat that as feedback that the production code is hiding its
dependencies. Pull them to the construction boundary.

| Instead of...                                          | Prefer this...                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Mock an imported module and assert a method was called | Inject the collaborator and assert the observable result or side effect |
| Spy on `Date.now()` or random ID generation globally   | Inject a clock or ID generator with deterministic test behavior         |
| Patch `fetch`, `console`, or other globals per test    | Inject a client/logger interface at construction time                   |
| Verify collaborator call counts and call order         | Assert on the contract the subject exposes to its consumer              |

**Don't over-extract.** The goal of injection is to make _dependencies_ explicit
at the API boundary — not to wrap every expression in a named, testable
function. If a conditional is trivial (e.g., `value === true`, `!!x`), inline it
rather than extracting a helper whose only purpose is to be separately tested.
Extract a helper when it encapsulates meaningful knowledge (which env var to
read, which keys to check) or when it is reused across multiple call sites. A
function that re-states its argument with no additional knowledge is a sign the
extraction went too far.

---

## Test Levels

This project uses two test levels with distinct purposes:

**Unit tests** verify isolated behavior of pure functions, handlers, and business
logic. They run fast, require no external dependencies, and catch regressions in
core logic. Place unit tests alongside source files (`parser.test.ts` next to
`parser.ts`).

**Distribution E2E tests** verify the **built artifact** works correctly. They
live in separate Nx projects (`packages/<cli>-e2e/`), depend only on shared
test helpers from `packages/e2e-utils/`, and spawn the compiled output from
`dist/`. These catch build/bundle failures, missing deps, entry point wiring
issues, and platform-specific problems that unit tests cannot.

| Aspect           | Unit Tests                            | Distribution E2E                 |
| ---------------- | ------------------------------------- | -------------------------------- |
| **Scope**        | Single function or handler            | Full CLI command                 |
| **Speed**        | Milliseconds                          | Seconds                          |
| **Dependencies** | Test layers, fakes, or targeted mocks | Real file system, built artifact |
| **Location**     | Colocated with source                 | `packages/<cli>-e2e/`            |
| **Tests what**   | Logic correctness, edge cases         | Build integrity, CLI behavior    |
| **Runs**         | `pnpm test`                           | `pnpm test:e2e`                  |

---

## Choosing the Lowest Effective Test Level

Prefer the **lowest test level that gives meaningful confidence**. A behavior
usually should be asserted once at the cheapest level that still produces a
clear, trustworthy signal.

- Prefer **unit before E2E**.
- Do not reproduce the same assertion at every layer unless each layer covers a
  distinct risk.
- When a higher-level test already covers the behavior clearly and cheaply, an
  additional unit test is often noise rather than confidence.

### Write a Unit Test When...

- The code is a **shared primitive or library API**, not command-local glue.
- The module exposes a **contract** that multiple consumers may rely on.
- The behavior includes **branching, composition, fallback behavior, or
  parsing/formatting rules**.
- A failure would be **indirect, slow, or expensive to diagnose** from an E2E
  failure.
- The test can remain **behavioral and structure-insensitive** through normal
  refactors.

### Prefer Higher-Level Coverage Instead When...

- The code is a **thin wrapper** or command-local composition.
- An E2E test already covers the behavior clearly.
- The unit test would mostly assert **incidental structure**.
- The assertion inspects a source-level representation instead of executing the
  system and observing the result.
- The module is primarily declarative, and the test would only restate the
  declaration rather than verify the effect of applying it.
- The code does not define a reusable contract; it only supports a higher-level
  capability that is already tested elsewhere.

### Decision Rubric

Before adding a new lower-level test, ask:

1. Is this a **shared contract** or just **local composition**?
2. What is the **lowest level** that gives a meaningful, fast signal?
3. Would a failure here be **easier to understand** than a failure in a broader
   test?
4. Can this test stay **stable through refactors** without turning into
   structure policing?
5. Is it covering a **distinct risk**, or only repeating what a higher-level
   test already proves?

If the answers point toward duplication, prefer the higher-level test and skip
the unit test.

---

## When to Write Tests

Tests serve as executable specifications that define desired behavior before
implementation. This project follows test-first development for most changes:

- **New features** — Write tests that describe expected behavior, then implement
- **Bug fixes** — Write a failing test that reproduces the bug, then fix it
- **Refactoring** — Ensure existing tests pass before and after changes

The CLAUDE.md testing checklist captures the workflow: designs prescribe testing,
tests define behavior, implementation follows.

When a change can affect shipped CLI behavior, run both `pnpm test` and
`pnpm test:e2e`.

For targeted verification, prefer repo-backed Nx targets over direct tool
invocations:

- `pnpm nx run <project>:test --args="path/to/test.ts"`
- `pnpm nx run <project>:test --args='path/to/test.ts -t "test name"'`
- `pnpm nx run <project>:typecheck`

Avoid direct `vitest` or `tsc` commands when an equivalent `pnpm` script or
`pnpm nx` target exists.

---

## Unit Tests

Unit tests verify the logic of a single module in isolation, using
constructor-injected fakes or stubs for external dependencies. Each test should
verify one behavior, assert on observable output (return values, emitted errors,
side effects), and survive refactoring without breaking.

| Instead of...                                 | Test this...                                                  |
| --------------------------------------------- | ------------------------------------------------------------- |
| Assert that method `_validate` was called     | Assert that invalid input produces the expected error         |
| Assert internal map has 3 entries             | Assert that 3 items are returned from the public query method |
| Mock every collaborator and verify call order | Assert the final result given known inputs                    |
| Snapshot an entire object for equality        | Assert on the specific fields that matter for this behavior   |

When a unit test feels awkward without a mock framework, the usual fix is to
redesign the module so its dependencies are explicit and swappable — not a more
elaborate mock setup.

### Unit Test Anti-Checklist

- [ ] **No copy re-assertion** — Does not simply repeat static text or
      declarative content already visible in the source
- [ ] **No thin-wrapper tests** — Does not test command-local composition that
      adds no meaningful behavior
- [ ] **No mock-heavy structure policing** — Does not mock the environment so
      heavily that only incidental structure remains to assert
- [ ] **No hidden-seam mocks** — Does not depend on module interception,
      monkey-patching globals, or call-order assertions where constructor
      injection would provide a clearer seam
- [ ] **No declarative duplication** — Does not create a second copy of a config
      or data declaration in assertion form

---

## Distribution E2E Tests

E2E tests verify complete user-facing workflows through the CLI's public entry
points. They confirm that the full stack — from command invocation to exit code
and output — produces correct results with the real built artifact.

### E2E Test Principles

- **Observer is an end user.** Written from the perspective of someone running
  the CLI.
- **Full-stack, real artifact.** Real file system, built binary. If you are
  faking a major boundary, the test is not earning its E2E cost.
- **Selective, risk-based coverage.** Not exhaustive — unit tests provide
  breadth. The goal is confidence that critical workflows survive real-world
  wiring.
- **Assert on user-visible outcomes.** Exit codes, stdout/stderr output, file
  system state changes — not internal state or intermediate steps.
- **Self-contained lifecycle.** Each test provisions its own state without
  depending on other tests, shared fixtures, or prior runs.

### E2E Coverage Criteria

| Criterion               | E2E justified                                                  | Unit test sufficient                        |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| **Failure impact**      | Workflow failure would be user-facing and high-severity        | Failure is internal or low-severity         |
| **Wiring complexity**   | Multiple layers (config, file system, output) must collaborate | Behavior is within a single module boundary |
| **Build fidelity risk** | Build/bundle failures may hide issues unit tests miss          | Logic is independent of build output        |
| **Regression history**  | Scenario has regressed before due to integration issues        | No history of integration-level regressions |

When in doubt, start with unit test coverage and promote to E2E only when a
specific risk justifies the cost.

---

## Test Properties

Every test balances a set of desirable properties. No single test maximizes all
of them — the art is choosing the right tradeoffs for the concern being tested.
These properties are adapted from Kent Beck's
[test desiderata](https://testdesiderata.com/).

| Property                  | What it means                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------- |
| **Isolated**              | Tests return the same result regardless of the order in which they are run            |
| **Composable**            | Tests can be combined and run in any subset without changing results                  |
| **Deterministic**         | If the code hasn't changed, the test result never changes (no flakiness)              |
| **Fast**                  | Runs quickly enough that developers run tests continuously without hesitation         |
| **Writable**              | Cheap and easy to write relative to the cost of the code being tested                 |
| **Readable**              | A reader can understand the intent and motivation of the test without digging deep    |
| **Behavioral**            | Sensitive to changes in the observable behavior of the code                           |
| **Structure-insensitive** | Unaffected by changes to the internal structure or implementation details of the code |
| **Automated**             | Runs without human intervention                                                       |
| **Specific**              | When it fails, the cause of the failure and the "code of interest" are obvious        |
| **Predictive**            | If all tests pass, the developer has high confidence the code is production-ready     |
| **Inspiring**             | Passing tests inspire a genuine sense of confidence, security, and progress           |

### Properties in Tension

These properties compete. Optimizing for one often means accepting less of
another — Beck calls these "sliders." Recognizing the tensions helps you make
deliberate tradeoffs instead of accidental ones.

- **Fast vs Predictive** — Unit tests are fast but exercise the system in
  isolation. E2E tests are slower but more predictive of production behavior.
- **Specific vs Predictive** — A highly specific test pinpoints failures but
  only covers a narrow slice. A broad E2E test is more predictive but produces
  harder-to-diagnose failures.
- **Behavioral vs Structure-insensitive** — Tests should respond to behavior
  changes (behavioral) while ignoring refactors (structure-insensitive). Tests
  that rely on module mocks, hidden seams, or call-order assertions sacrifice
  structure-insensitivity for a false sense of behavioral coverage.
- **Writable vs Readable** — Heavily abstracted test helpers can make tests
  cheap to write but opaque to read. Favor clarity over brevity — a reader
  should understand the test's motivation without tracing through shared
  fixtures.
- **Isolated vs Predictive** — Fully isolated tests are deterministic and
  parallelizable but miss real integration issues. Balance isolation with enough
  real collaboration to catch boundary problems.

---

## Effect Testing

For new Effect tests, prefer `@effect/vitest` helpers such as `it.effect`,
`it.scoped`, and `it.layer` over manual `Effect.runPromise` wiring. Prefer
seams and test layers over mocks; mock third-party boundaries only when an
explicit seam is impractical.

---

## Convention Enforcement Is Not Testing

Tests verify runtime behavior — what the system does when it runs. Assertions on
file names, import paths, directory layout, comment presence, or code
organization verify project structure, not runtime behavior. A test that breaks
when you rename a file without changing any observable behavior is
structure-sensitive by definition.

Convention enforcement is valuable, but the test suite is not the right home for
it. Use linters, static-analysis CI steps, or documented code review
expectations instead.

_Examples of structural assertions that are not tests:_

| Structural assertion                                                             |
| -------------------------------------------------------------------------------- |
| Assert file names match a naming convention                                      |
| Assert import paths follow a pattern                                             |
| Assert comments or TODOs exist in specific files                                 |
| Assert directory structure mirrors a URL tree                                    |
| Assert a source artifact contains a specific structural pattern to encode policy |
| Assert configuration directly instead of verifying the runtime effect it causes  |

---

## Test Placement

Co-locate tests with the code they verify. Use clear naming suffixes to signal
scope.

| Test type | Location                                       | Example             |
| --------- | ---------------------------------------------- | ------------------- |
| Unit      | Next to the module, `*.test.ts`                | `publish.test.ts`   |
| E2E       | Dedicated e2e project, mirroring app structure | `packages/cli-e2e/` |

---

## See Also

- [Feature Delivery Guide](./feature-delivery.md) — Proposal to verification
  checks
- [Effect Guide](./effect.md) — Core Effect patterns and skill index
- [Test Desiderata](https://kentbeck.github.io/TestDesiderata/) — Kent Beck's
  framework for evaluating test quality trade-offs
