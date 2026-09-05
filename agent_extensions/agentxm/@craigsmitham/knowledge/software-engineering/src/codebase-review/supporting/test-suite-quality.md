---
type: Checklist
title: Test-suite quality criteria
description: Use when assessing automated tests as supporting artifacts; evaluate whether the suite provides valuable, sustainable, and appropriately bounded evidence for applicable product-quality claims.
tags: [codebase-review, testing, test-quality, assurance, evidence, supporting-artifact, reporting-review]
status: draft
sources:
  - id: test-desiderata
    resource: https://testdesiderata.com/
    title: Test Desiderata
  - id: testing-theory
    resource: https://archiv.infsec.ethz.ch/intranet_secured/Y/w/GG75.pdf
    title: Toward a Theory of Test Data Selection
  - id: google-testing
    resource: https://abseil.io/resources/swe-book/html/ch11.html
    title: Software Engineering at Google — Testing overview
  - id: google-unit-testing
    resource: https://abseil.io/resources/swe-book/html/ch12.html
    title: Software Engineering at Google — Unit testing
  - id: google-test-doubles
    resource: https://abseil.io/resources/swe-book/html/ch13.html
    title: Software Engineering at Google — Test doubles
  - id: google-larger-testing
    resource: https://abseil.io/resources/swe-book/html/ch14.html
    title: Software Engineering at Google — Larger testing
  - id: flaky-tests
    resource: https://mir.cs.illinois.edu/marinov/publications/LuoETAL14FlakyTestsAnalysis.pdf
    title: An Empirical Analysis of Flaky Tests
  - id: coverage
    resource: https://www.cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf
    title: Coverage Is Not Strongly Correlated with Test Suite Effectiveness
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Test-suite quality criteria

Use this list to assess automated tests as a supporting artifact. Test-suite
quality is distinct from both product testability and the product qualities
the tests are meant to investigate:

```text
product testability = how readily product claims can be investigated
test-suite quality  = how valuable and sustainable the tests are as evidence
product quality     = what that evidence is intended to justify
```

Test Desiderata treats useful test properties as interacting aims rather than
a score in which every property can be maximized at once.[^test-desiderata]
This candidate `reporting-review` checklist therefore asks for a bounded
artifact judgment and preserves tradeoffs, uncertainty, and applicability.

Apply the shared states and record shape in [Reviewing a
codebase](../reviewing-a-codebase.md). `XC-01` Claim context identifies the
product claims, change risks, execution environments, and consequence the suite
is intended to support. `XC-06` Assurance relates the suite to a broader
verification portfolio, while `XC-08` Evidence governs relevance, validity,
representativeness, attribution, freshness, and uncertainty. A high-quality
suite can support but cannot establish a product-quality verdict.

## Criteria

### TSQ-01 — Claim relevance

**Outcome question:** Do the tests materially bear on the product-quality
claims they are intended to support?[^testing-theory][^google-testing]

**Why it matters:** a suite can execute large amounts of code while producing
little evidence about consequential behavior or change risk.

**Applicability:** name the product claims, risks, and decision the suite is
intended to inform. Missing claim context makes the artifact judgment
`Indeterminate`, not the product automatically defective.

**Boundary:** this criterion owns evidentiary relevance of the suite. Product
criteria own whether the product meets the claims; `EVO-05` owns the product's
testability.

### TSQ-02 — Risk coverage

**Outcome question:** Does the suite represent the material success, boundary,
failure, interruption, recovery, and regression conditions within its declared
risk scope?[^google-unit-testing][^google-larger-testing]

**Why it matters:** reassuring nominal examples can coexist with large gaps in
the conditions most likely to produce consequential failure.

**Applicability:** interpret materiality from claim context and risk rather than
demanding every possible input or path. Coverage metrics are incomplete proxies
for fault-detection effectiveness.[^coverage]

**Boundary:** this criterion owns risk-oriented case selection. `TSQ-03` owns
fidelity of the test world and `TSQ-04` owns whether outcomes discriminate.

### TSQ-03 — World representativeness

**Outcome question:** Do fixtures, generated data, environments, mocks, fakes,
and other substitutes preserve the real distinctions material to the supported
claims?[^google-test-doubles][^google-larger-testing]

**Why it matters:** convenient test worlds can drift from users, data,
dependencies, configuration, and failure behavior while remaining green.

**Applicability:** identify which real relationship each substitute represents
and which differences are accepted. Full production identity is neither
necessary nor always safe.

**Boundary:** this criterion owns fidelity of the evidence world.
Compatibility and other product criteria own the real relationship itself.

### TSQ-04 — Outcome discrimination

**Outcome question:** Do test results distinguish conforming behavior from each
material departure the case is intended to detect?[^testing-theory][^google-unit-testing]

**Why it matters:** execution without a discriminating oracle can report
success while missing the behavior that matters.

**Applicability:** the needed observation can be a value, state, invariant,
effect, failure, trace, or bounded property. More assertions do not
automatically improve discrimination.

**Boundary:** this criterion owns sensitivity of the test result to the stated
departure. `TSQ-01` owns whether that departure matters to the product claim.

### TSQ-05 — Reproducibility

**Outcome question:** Under equivalent declared code, inputs, and environments,
does the suite produce stable results while keeping permitted nondeterminism
visible?[^flaky-tests][^test-desiderata]

**Why it matters:** irreproducible results weaken trust, consume diagnostic
effort, and normalize real failures as noise.

**Applicability:** probabilistic products and tests can still be reproducible at
the level of distribution, bound, seed, or stated uncertainty. Retries,
quarantine, and skips must not masquerade as resolution.

**Boundary:** this criterion owns stability and honesty of test outcomes.
`XC-04` Lifecycle integrity owns the construction and execution environment;
`XC-08` owns the evidence conclusion.

### TSQ-06 — Isolation

**Outcome question:** Can each test produce its intended result without
uncontrolled influence from other tests or prior execution?[^test-desiderata][^flaky-tests]

**Why it matters:** hidden ordering, shared state, leaked work, and resource
contention make results dependent on accidents of suite execution.

**Applicability:** shared fixtures and intentionally stateful sequences can be
valid when their influence is explicit and bounded.

**Boundary:** this criterion owns independence of test results. Product fault
containment and security isolation are separate product outcomes.

### TSQ-07 — Composability

**Outcome question:** Can relevant tests be selected, combined, and repeated
without changing their declared meaning?[^test-desiderata][^google-testing]

**Why it matters:** suites that work only as one opaque sequence impede focused
feedback, parallel execution, and reuse across verification contexts.

**Applicability:** some system scenarios legitimately require an ordered
composition; the order and shared preconditions must then be part of the test
contract.

**Boundary:** this criterion owns stable composition of test artifacts.
`TSQ-06` owns uncontrolled influence, while Lifecycle integrity owns task and
execution configuration.

### TSQ-08 — Legibility

**Outcome question:** Can qualified maintainers determine which claim a test
supports and what a failure contradicts?[^google-unit-testing][^test-desiderata]

**Why it matters:** evidence loses practical value when a result does not reveal
the scenario, expectation, or reason it matters.

**Applicability:** clarity can come from names, data, helpers, failure output,
structure, or linked specification; no single formatting style is required.

**Boundary:** this criterion owns comprehension of the test artifact.
Intelligibility owns comprehension of the product itself.

### TSQ-09 — Maintenance economy

**Outcome question:** Can the suite evolve with accepted behavior at a cost
proportionate to the evidence it preserves?[^test-desiderata][^google-unit-testing]

**Why it matters:** tests coupled to irrelevant implementation detail become
expensive to write and revise, encouraging broad deletion or ignored failures.

**Applicability:** legitimate structural contracts, performance properties, or
implementation-level guarantees can require structure-sensitive tests. Judge
the supported claim, not a universal preference for black-box testing.

**Boundary:** this criterion owns sustainability of the test artifact.
Evolvability owns change capacity of the product; `TSQ-01` owns whether retained
evidence remains relevant.

### TSQ-10 — Feedback fitness

**Outcome question:** Does the suite return attributable results soon enough
for the decision or correction it is intended to support?[^test-desiderata][^google-testing]

**Why it matters:** evidence that arrives too late, cannot be connected to its
execution, or is routinely bypassed loses decision value.

**Applicability:** acceptable delay and execution frequency depend on
consequence, cost, scope, and the decision point. Slow tests can remain valuable
in an appropriately layered portfolio.

**Boundary:** this criterion owns timeliness and attribution of suite feedback.
`XC-07` Feedback owns the wider engineering-system capability; faster execution
does not compensate for irrelevant or nondiscriminating tests.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
The ten items are interacting review lenses, not equal-weight factors. A strong
suite does not prove product correctness, safety, security, or fitness, and no
finite test suite establishes exhaustive fault absence.[^testing-theory]

[^test-desiderata]: Beck and Sutton, [Test Desiderata](https://testdesiderata.com/).
[^testing-theory]: Goodenough and Gerhart, [Toward a Theory of Test Data Selection](https://archiv.infsec.ethz.ch/intranet_secured/Y/w/GG75.pdf).
[^google-testing]: Google, [Testing overview](https://abseil.io/resources/swe-book/html/ch11.html).
[^google-unit-testing]: Google, [Unit testing](https://abseil.io/resources/swe-book/html/ch12.html).
[^google-test-doubles]: Google, [Test doubles](https://abseil.io/resources/swe-book/html/ch13.html).
[^google-larger-testing]: Google, [Larger testing](https://abseil.io/resources/swe-book/html/ch14.html).
[^flaky-tests]: Luo et al., [An Empirical Analysis of Flaky Tests](https://mir.cs.illinois.edu/marinov/publications/LuoETAL14FlakyTestsAnalysis.pdf).
[^coverage]: Inozemtseva and Holmes, [Coverage Is Not Strongly Correlated with Test Suite Effectiveness](https://www.cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf).
