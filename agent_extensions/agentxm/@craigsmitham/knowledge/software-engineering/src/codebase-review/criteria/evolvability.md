---
type: Checklist
title: Evolvability quality criteria
description: Use when assessing whether the product can accommodate required change over its lifetime without disproportionate risk, delay, or cost.
tags: [codebase-review, software-quality, evolvability, maintainability, flexibility, testability, reporting-review]
status: draft
sources:
- id: iso-25010
  resource: https://www.iso.org/standard/78176.html
  title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
- id: iso-25010-preview
  resource: https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf
  title: ISO/IEC 25010:2023 public preview
- id: parnas-modules
  resource: https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html
  title: On the Criteria To Be Used in Decomposing Systems into Modules
- id: parnas-extension
  resource: https://cse.msu.edu/~cse870/Public/Homework/SS2003/HW5/parnas-extension.pdf
  title: Designing Software for Ease of Extension and Contraction
- id: lehman
  resource: https://users.ece.utexas.edu/~perry/education/SE-Intro/lehman.pdf
  title: Programs, Life Cycles, and Laws of Software Evolution
- id: f1-schema
  resource: https://research.google.com/pubs/archive/41376.pdf
  title: Online, Asynchronous Schema Change in F1
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Evolvability quality criteria

Use this list to judge the product's capacity to accommodate required change
over its lifetime. The criterion is the sustainable change outcome, not the
presence of a pattern, module shape, test, pipeline, versioning scheme, or
maintenance practice. Continuing environmental and requirement change makes
this a product concern even when no immediate edit is planned.[^iso-25010][^lehman]

This is a candidate `reporting-review` checklist. Apply the shared assessment
states and evidence rules in [Reviewing a
codebase](../reviewing-a-codebase.md). The pillar definition and neighbor
boundaries are in [Software quality
pillars](../software-quality-pillars.md); the typed relationships below use
[Cross-cutting concerns for software quality](../cross-cutting-concerns.md).

## Default cross-cutting relationships

`XC-01` Claim context constrains every criterion through likely changes,
lifecycle horizon, environments, consumers, consequence, and sustainable
cost. `XC-08` Evidence must qualify every judgment. Unless a criterion says
otherwise, these list-level defaults apply:

| Concern | Default relationship to Evolvability |
| --- | --- |
| `XC-02` Specification | `(EN·EV)` — preserves change intent, constraints, contracts, and acceptance bounds. |
| `XC-03` Structure | `CTR` — localization, dependency, authority, and complexity can materially shape change cost and risk. |
| `XC-04` Lifecycle integrity | `EN` — controlled versions, construction, migration, and recovery make sustainable change feasible. |
| `XC-05` Risk | `TH·CS·TR` — change scenarios and tradeoffs determine which flexibility is valuable. |
| `XC-06` Assurance | `EN·EV` — proportionate verification can make changed behavior credible. |
| `XC-07` Feedback | `EN·EV` — operational and change feedback can expose consequences and guide later evolution. |

## Criteria

### EVO-01 — Impact discernibility

**Outcome question:** Can the product impact of a representative change be
bounded before implementation?[^iso-25010-preview]

**Why it matters:** change becomes risky and slow when its consequence cannot
be bounded before implementation.

**Applicability:** apply to representative likely changes within the declared
lifecycle horizon. A hypothetical change with no plausible context provides
weak evidence.

**Boundary:** this criterion owns change-impact determination. Intelligibility
owns accurate comprehension generally; `XC-08` Evidence owns whether a
particular impact analysis is trustworthy.

### EVO-02 — Change locality

**Outcome question:** Can a representative change be completed
without modifying unrelated product responsibilities?[^parnas-modules]

**Why it matters:** scattered change multiplies coordination, regression,
delay, and inconsistency risk.

**Applicability:** judge against concrete change scenarios and semantic
responsibilities, not file counts or a preferred directory layout.

**Boundary:** this criterion owns the observed scope of change. `XC-03`
Structure describes contributors such as information hiding; Intelligibility
owns whether boundaries can be understood.

### EVO-03 — Modification feasibility

**Outcome question:** Can a required behavioral change
be implemented correctly within its sustainable risk, delay, and cost
tolerance?[^iso-25010-preview]

**Why it matters:** a product is not evolvable when routine required change
is technically possible only through disproportionate effort or exposure.

**Applicability:** apply to a declared change class and tolerance. Historical
effort can support the judgment but is not automatically representative of
future work.

**Boundary:** this criterion owns feasibility of changing behavior.
Correctness owns conformance of the changed result; `EVO-02` owns whether the
change remains local.

### EVO-04 — Reuse fitness

**Outcome question:** Can an intended product capability be reused
in each declared context without importing irrelevant behavior or
assumptions?[^iso-25010-preview][^parnas-extension]

**Why it matters:** reusable assets reduce repeated change only when their
contracts and dependencies remain appropriate to the new context.

**Applicability:** apply only where reuse is an accepted product objective;
duplication can be preferable for independently evolving responsibilities.

**Boundary:** this criterion owns fitness for intended reuse. Suitability owns
whether the capability serves the new goal; Compatibility owns present
interoperation between independently governed participants.

### EVO-05 — Testability

**Outcome question:** Can each material product-quality claim be investigated
after representative change at a cost proportionate to its
consequence?[^iso-25010-preview]

**Why it matters:** changes cannot be sustained confidently when relevant
behavior is prohibitively difficult to stimulate or observe.

**Applicability:** interpret “test” broadly as an investigation that can
produce evidence. Control, observation, and isolation are possible affordances;
the needed combination depends on consequence and the quality claim.

**Boundary:** this criterion owns a product affordance for investigation.
`XC-06` Assurance owns the verification portfolio, `XC-08` Evidence owns the
grounds it produces, and [Test-suite quality
criteria](../supporting/test-suite-quality.md) owns the tests as artifacts.

### EVO-06 — Adaptability

**Outcome question:** Can the product accommodate each required
change of operating environment without disproportionate product
modification?[^iso-25010-preview]

**Why it matters:** products coupled to incidental environment assumptions
become expensive or infeasible to move as their context changes.

**Applicability:** apply to declared changes in platform, locale,
configuration, device, infrastructure, or operating context. Do not require
universal portability.

**Boundary:** this criterion owns future environmental adaptation.
Compatibility owns operation in the presently required environment;
Lifecycle integrity owns construction and deployment controls.

### EVO-07 — Scalability

**Outcome question:** Can the product be changed to support each
required future demand range with proportionate risk, delay, and cost?[^iso-25010-preview]

**Why it matters:** present capacity can be adequate while the architecture
makes anticipated growth prohibitively disruptive.

**Applicability:** apply only to justified future changes in data, users,
throughput, geography, tenancy, or another material dimension.

**Boundary:** this criterion owns capacity to change for future scale.
Efficiency owns present workload capacity and resource fitness; Reliability
owns current behavior at or beyond capacity.

### EVO-08 — Installability

**Outcome question:** Can an intended product version become and cease to be
operative within its declared transition constraints?[^iso-25010-preview]

**Why it matters:** a correct change has no sustainable value when it cannot
become or cease to be the operative product state safely and predictably.

**Applicability:** interpret installation for the product form: deployment,
library resolution, firmware update, extension activation, data-product
publication, or another release transition.

**Boundary:** this criterion owns product properties that permit version
introduction or removal. `XC-04` Lifecycle integrity owns the engineering
system that performs and records those operations.

### EVO-09 — Migration capacity

**Outcome question:** Can an installed use of the product reach each required
future version within its declared migration tolerance?[^f1-schema]

**Why it matters:** the ability to implement a new version is incomplete when
existing use cannot move to it sustainably.

**Applicability:** apply where an installed base, retained state, staged
rollout, or independently evolving consumer must cross a version boundary.

**Boundary:** this criterion owns feasibility of the transition path.
Compatibility owns whether specified versions and data interoperate during
that path; Reliability owns continuity and recovery while it executes.

### EVO-10 — Replaceability

**Outcome question:** Can each declared replaceable component,
dependency, service, or product role be substituted within its sustainable
risk, delay, and cost tolerance?[^iso-25010-preview][^parnas-extension]

**Why it matters:** hidden assumptions and concentrated dependency knowledge
can turn ordinary replacement into a product-wide redesign.

**Applicability:** apply only where substitution is a justified lifecycle
need, such as end-of-life, vendor change, platform transition, or alternate
provider.

**Boundary:** this criterion owns capacity to perform a future replacement.
Compatibility owns whether a present substitute already satisfies the shared
behavioral relationship; `XC-04` owns component identity and provenance.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
Completion does not establish that every future change is cheap or safe, and a
green test suite does not by itself establish evolvability.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^iso-25010-preview]: ISO/IEC, [ISO/IEC 25010:2023 public preview](https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf).
[^parnas-modules]: Parnas, [On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html).
[^parnas-extension]: Parnas, [Designing Software for Ease of Extension and Contraction](https://cse.msu.edu/~cse870/Public/Homework/SS2003/HW5/parnas-extension.pdf).
[^lehman]: Lehman, [Programs, Life Cycles, and Laws of Software Evolution](https://users.ece.utexas.edu/~perry/education/SE-Intro/lehman.pdf).
[^f1-schema]: Rae et al., [Online, Asynchronous Schema Change in F1](https://research.google.com/pubs/archive/41376.pdf).
