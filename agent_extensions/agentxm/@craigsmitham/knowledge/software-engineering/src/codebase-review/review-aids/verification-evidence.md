---
type: Guide
title: Verification evidence
description: Use when selecting and interpreting tests, analysis, proofs, scans, measurements, and reviews as evidence rather than product outcomes.
tags: [codebase-review, review-aid, verification, validation, assurance, evidence]
status: draft
sources:
  - id: ieee-1012
    resource: https://standards.ieee.org/ieee/1012/7324/
    title: IEEE 1012-2024 Standard for System, Software, and Hardware Verification and Validation
  - id: testing-theory
    resource: https://archiv.infsec.ethz.ch/intranet_secured/Y/w/GG75.pdf
    title: Toward a Theory of Test Data Selection
  - id: nist-verification
    resource: https://nvlpubs.nist.gov/nistpubs/ir/2021/NIST.IR.8397.pdf
    title: NIST IR 8397 Guidelines on Minimum Standards for Developer Verification of Software
  - id: assurance-case
    resource: https://www.iso.org/standard/80625.html
    title: ISO/IEC/IEEE 15026-2:2022 Assurance case
  - id: coverage
    resource: https://www.cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf
    title: Coverage Is Not Strongly Correlated with Test Suite Effectiveness
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Verification evidence

Use this optional aid after naming the exact product-quality claim. Verification
and validation can use review, inspection, analysis, testing, measurement,
proof, simulation, scanning, or other techniques; the appropriate portfolio
depends on the claim and consequence.[^ieee-1012] A method result is possible
evidence, not the product outcome.

## Start from the departure that matters

1. State the accepted claim, conditions, tolerance, and decision.
2. Describe a material contrary condition the evidence must be capable of
   revealing.
3. Select methods whose observation and model can discriminate that departure.
4. Preserve the method's assumptions, blind spots, execution identity, result,
   counterevidence, and uncertainty.
5. Combine independent or complementary evidence where one method leaves a
   material gap.

Testing theory has long treated test selection and adequacy as a reasoned
relationship between cases and the faults or departures they can expose, not as
proof from execution count alone.[^testing-theory]

## Match methods to claims

| Evidence method | Particularly useful for | Common overclaim to avoid |
| --- | --- | --- |
| Contract or specification review | Authority, completeness, ambiguity, trace relationships | An explicit requirement proves product conformance |
| Static reasoning or proof | Defined models, invariants, paths, types, dependency and information-flow properties | Model assumptions cover the operative product and environment automatically |
| Example or property tests | Observable behavior across selected cases and generated domains | Passing cases establish the whole domain or the right stakeholder need |
| Boundary or integration tests | Representation, protocol, dependency, configuration, and version relationships | One test environment represents every deployed relationship |
| Fault, load, or recovery exercises | Reliability, capacity, degradation, interruption, and restoration scenarios | Injected conditions represent all faults or production dynamics |
| Security analysis, fuzzing, and scanning | Declared threat classes, malformed influence, known weaknesses, unexpected inputs | Tool silence establishes security |
| Benchmarks, profiles, and measurements | Bounded time, resource, cost, and attribution claims | A number without representative workload or uncertainty is the quality outcome |
| Human review or evaluation | Suitability, usability, intelligibility, domain judgment, novel interactions | Reviewer agreement or expertise substitutes for representative evidence |

NIST's developer-verification guidance recommends multiple technique families
for vulnerability reduction; it does not make any one technique sufficient for
all security claims.[^nist-verification]

## Judge the evidence-to-claim link

Ask whether the evidence is:

- relevant to the exact claim and contrary condition;
- valid under the stated model, oracle, environment, and assumptions;
- representative of the users, inputs, workloads, versions, and scenarios;
- attributable to the reviewed revision, artifact, configuration, method, and
  result;
- fresh enough for the current product state and decision;
- sufficiently complete alongside known gaps and counterevidence; and
- honest about nondeterminism, measurement uncertainty, skips, exclusions,
  inconclusive results, and unavailable evidence.

Coverage, test count, scanner severity, proof completion, and green execution
can help navigate evidence but cannot independently establish effectiveness;
empirical work has, for example, found coverage to be an unreliable proxy for
test-suite effectiveness when suite size is controlled.[^coverage]

## Preserve the argument

```text
Claim:
Material departure:
Method and identity:
Result:
Assumptions:
Evidence-to-claim rationale:
Counterevidence:
Coverage limits:
Uncertainty:
Resulting assessment state:
```

Assurance-case practice keeps claims, arguments, assumptions, and evidence
distinct so missing reasoning is not hidden behind an artifact reference.[^assurance-case]
Use `Indeterminate` when the method cannot discriminate the relevant departure
or the evidence cannot be bound to the claim. A strong result can narrow
uncertainty; it does not convert checklist completion into certification.

[^ieee-1012]: IEEE, [IEEE 1012-2024 Verification and Validation](https://standards.ieee.org/ieee/1012/7324/).
[^testing-theory]: Goodenough and Gerhart, [Toward a Theory of Test Data Selection](https://archiv.infsec.ethz.ch/intranet_secured/Y/w/GG75.pdf).
[^nist-verification]: NIST, [IR 8397 Guidelines on Minimum Standards for Developer Verification of Software](https://nvlpubs.nist.gov/nistpubs/ir/2021/NIST.IR.8397.pdf).
[^assurance-case]: ISO, [ISO/IEC/IEEE 15026-2:2022 assurance case](https://www.iso.org/standard/80625.html).
[^coverage]: Inozemtseva and Holmes, [Coverage Is Not Strongly Correlated with Test Suite Effectiveness](https://www.cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf).
