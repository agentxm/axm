---
type: Checklist
title: Correctness quality criteria
description: Use when assessing whether product behavior conforms to applicable contracts and preserves declared invariants across relevant conditions and transitions.
tags: [codebase-review, software-quality, correctness, contracts, invariants, behavior, reporting-review]
status: draft
sources:
- id: iso-25010
  resource: https://www.iso.org/standard/78176.html
  title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
- id: hoare
  resource: https://sites.cs.ucsb.edu/~kemm/courses/cs266/acmhoare69.pdf
  title: An Axiomatic Basis for Computer Programming
- id: dijkstra
  resource: https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html
  title: Notes on Structured Programming
- id: nasa-inspections
  resource: https://sw-eng.larc.nasa.gov/wp-content/uploads/sites/23/2013/05/Instructional-Handbook-for-Formal-Inspections.pdf
  title: NASA Instructional Handbook for Formal Inspections
- id: data-abstraction
  resource: https://publications.csail.mit.edu/lcs/pubs/pdf/MIT-LCS-TR-561.pdf
  title: A History of CLU
- id: nasa-mco
  resource: https://discovery.larc.nasa.gov/discovery/PDF_FILES/mars_climate_orbiter_phaseII.pdf
  title: Mars Climate Orbiter Mishap Investigation Board Phase II Report
- id: json-schema
  resource: https://json-schema.org/draft/2020-12/json-schema-validation
  title: JSON Schema Validation 2020-12
- id: error-handling
  resource: https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-yuan.pdf
  title: Simple Testing Can Prevent Most Critical Failures
- id: concurrency-bugs
  resource: https://www.cs.columbia.edu/~junfeng/12fa-e6121/papers/concurrency-bugs.pdf
  title: Learning from Mistakes — A Comprehensive Study on Real World Concurrency Bug Characteristics
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Correctness quality criteria

Use this list to judge whether observable product behavior conforms to its
accepted contracts and preserves declared meaning. Proofs, tests, types,
analysis, and review can support a judgment; none is correctness itself.
Correctness is always relative to applicable preconditions, postconditions,
invariants, and permitted behavior.[^hoare][^dijkstra]

This is a candidate `reporting-review` checklist. Apply the shared assessment
states and evidence rules in [Reviewing a
codebase](../reviewing-a-codebase.md). The pillar definition and neighbor
boundaries are in [Software quality
pillars](../software-quality-pillars.md); the typed relationships below use
[Cross-cutting concerns for software quality](../cross-cutting-concerns.md).

## Default cross-cutting relationships

`XC-01` Claim context constrains every criterion through accepted contracts,
conditions, scope, and consequence. `XC-08` Evidence must qualify every
judgment. Unless a criterion says otherwise, these list-level defaults apply:

| Concern | Default relationship to Correctness |
| --- | --- |
| `XC-02` Specification | `EN·EV` — supplies the governing behavior, domain, invariants, and tolerances. |
| `XC-03` Structure | `CTR·EV` — can preserve meaning and support local reasoning without proving conformance. |
| `XC-04` Lifecycle integrity | `EN·EV·TH` — identifies the operative versions, configuration, generated state, and construction evidence. |
| `XC-05` Risk | `TH·CS·TR` — consequential conditions and interactions shape required coverage and confidence. |
| `XC-06` Assurance | `EN·EV` — complementary verification activities can support correctness claims. |
| `XC-07` Feedback | `EV` — observed behavior and defects can provide bounded correctness evidence. |

## Criteria

### COR-01 — Result fidelity

**Outcome question:** For each applicable condition, do outputs
and effects match the governing contract with the required
precision?[^iso-25010][^hoare]

**Why it matters:** correctness ultimately concerns correspondence between
behavior and an accepted obligation.

**Applicability:** the contract must identify relevant inputs, conditions,
outputs, effects, and tolerances. Ambiguous authority can make the verdict
`Indeterminate` rather than `Does not meet`.

**Boundary:** this criterion owns conformance of the supplied result. A
faithfully implemented but inappropriate contract is a Suitability issue.

### COR-02 — Domain totality

**Outcome question:** Does every valid input and condition in the
declared domain receive defined behavior?[^hoare][^nasa-inspections]

**Why it matters:** omitted branches and unhandled valid cases create partial
behavior even when nominal examples pass.

**Applicability:** apply to the accepted domain of an existing capability,
including valid boundary cases. Do not infer the domain solely from observed
implementation behavior.

**Boundary:** this criterion owns missing behavior within a capability.
Suitability owns a missing capability or stakeholder need.

### COR-03 — Rejection fidelity

**Outcome question:** Are values and states outside the
accepted domain refused or normalized only as the contract permits?[^json-schema][^data-abstraction]

**Why it matters:** accepting an illegal state can violate product meaning
before any later computation occurs.

**Applicability:** apply where out-of-domain behavior is specified or
necessarily constrained. Lenient acceptance is not wrong when it is the
accepted contract. JSON Schema is one structural-validation example, not
general authority for the product's domain semantics.

**Boundary:** this criterion owns ordinary domain rejection. Security owns
adversarial exploitation; Usability owns whether users can understand or
recover from the rejection.

### COR-04 — Invariant preservation

**Outcome question:** Does every applicable operation
preserve each declared invariant?[^hoare][^data-abstraction]

**Why it matters:** locally plausible outputs can silently corrupt an
enduring product truth.

**Applicability:** apply only to invariants with accepted meaning and scope.
Missing ownership or declaration may create a Specification or Structure
concern without proving a product violation.

**Boundary:** this criterion owns truths that must hold across operations.
`COR-05` owns which state transitions are permitted.

### COR-05 — Transition legality

**Outcome question:** Does the product enter only declared
states through permitted transitions?[^nasa-inspections][^hoare]

**Why it matters:** individually valid values can still form an illegal
sequence or lifecycle.

**Applicability:** apply to stateful behavior, including repetition,
cancellation, reset, and interruption states when those states are within the
contract.

**Boundary:** this criterion owns legality of the resulting state movement.
Reliability owns continuity and recovery over time and faults.

### COR-06 — Representation fidelity

**Outcome question:** Does domain meaning remain invariant across every
product-owned representation boundary?[^iso-25010][^data-abstraction][^nasa-mco]

**Why it matters:** units, precision, identity, absence, defaults, and
canonical forms can silently change meaning across representations.

**Applicability:** apply where the product itself owns both the accepted
meaning and a construction, conversion, storage, transfer, or reconstruction
boundary.

**Boundary:** this criterion owns preservation of the product's meaning.
Compatibility owns agreement between independently governed participants;
Security owns adversarial manipulation of representations.

### COR-07 — Failure fidelity

**Outcome question:** When an operation fails, do its observable
result and residual state match the declared failure contract?[^error-handling][^hoare]

**Why it matters:** catching, logging, falling back, or retrying does not
establish correct failure semantics.

**Applicability:** apply to one failed operation and its permitted outcome.
The contract may legitimately allow partial effects when they are explicit.

**Boundary:** this criterion owns the semantic result of failure. Reliability
owns service survival, repetition tolerance, and recovery; Security owns
authorization closure on security-control failure.

### COR-08 — Atomicity

**Outcome question:** Are observable effects indivisible at every
boundary whose contract requires all-or-none behavior?[^hoare][^concurrency-bugs]

**Why it matters:** partial visibility can violate a contract even when every
individual mutation is valid.

**Applicability:** apply only where the contract declares or necessarily
implies an atomic boundary. Distributed or staged outcomes need not be
atomic when partial progress is accepted.

**Boundary:** this criterion owns whether partial visibility is permitted.
Reliability owns recovery from an accepted or accidental partial failure.

### COR-09 — Ordering fidelity

**Outcome question:** Do concurrent and asynchronous effects
obey every declared ordering and visibility rule?[^concurrency-bugs][^hoare]

**Why it matters:** correct operations in an invalid order can produce
behavior that violates the product contract.

**Applicability:** apply only where work can overlap or reorder and a semantic
ordering obligation exists.

**Boundary:** this criterion owns semantic order. Efficiency owns coordination
cost; Reliability owns service tolerance of scheduling or component faults.

### COR-10 — Progress fidelity

**Outcome question:** Does each operation complete, terminate,
or remain pending only as its accepted contract permits?[^dijkstra][^nasa-inspections]

**Why it matters:** nontermination, premature completion, or unintended
indefinite waiting can be incorrect even when intermediate values are valid.

**Applicability:** apply only where a progress or termination obligation
exists. Do not invent one from reviewer preference.

**Boundary:** this criterion owns the permitted completion state. Efficiency
owns how quickly work completes; Reliability owns continued service over
time.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
Atomicity, ordering, and progress are conditional semantic dimensions; where
the accepted contract contains no such obligation, mark them `Not applicable`
instead of manufacturing a finding.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^hoare]: Hoare, [An Axiomatic Basis for Computer Programming](https://sites.cs.ucsb.edu/~kemm/courses/cs266/acmhoare69.pdf).
[^dijkstra]: Dijkstra, [Notes on Structured Programming](https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html).
[^nasa-inspections]: NASA, [Instructional Handbook for Formal Inspections](https://sw-eng.larc.nasa.gov/wp-content/uploads/sites/23/2013/05/Instructional-Handbook-for-Formal-Inspections.pdf).
[^data-abstraction]: Liskov, [A History of CLU](https://publications.csail.mit.edu/lcs/pubs/pdf/MIT-LCS-TR-561.pdf).
[^nasa-mco]: NASA, [Mars Climate Orbiter Mishap Investigation Board Phase II Report](https://discovery.larc.nasa.gov/discovery/PDF_FILES/mars_climate_orbiter_phaseII.pdf).
[^json-schema]: JSON Schema, [Validation specification 2020-12](https://json-schema.org/draft/2020-12/json-schema-validation).
[^error-handling]: Yuan et al., [Simple Testing Can Prevent Most Critical Failures](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-yuan.pdf).
[^concurrency-bugs]: Lu et al., [Learning from Mistakes](https://www.cs.columbia.edu/~junfeng/12fa-e6121/papers/concurrency-bugs.pdf).
