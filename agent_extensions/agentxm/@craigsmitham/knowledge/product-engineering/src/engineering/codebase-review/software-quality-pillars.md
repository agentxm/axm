---
type: Explainer
title: Software quality pillars
description: Defines the ten candidate product-quality outcomes used by codebase review — suitability through intelligibility — with each pillar's desired outcome, inclusions, exclusions, nearest-neighbor boundary tests, the supporting layers deliberately kept outside the ten, and the split between judging a product and sustaining one.
tags: [codebase-review, software-quality, quality-model, taxonomy, outcomes, pillar-boundaries, quality-layers, applicability, pe-engineering]
status: draft
sources:
  - id: dijkstra
    resource: https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html
    title: Notes on Structured Programming
  - id: hoare
    resource: https://sites.cs.ucsb.edu/~kemm/courses/cs266/acmhoare69.pdf
    title: An Axiomatic Basis for Computer Programming
  - id: parnas
    resource: https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html
    title: On the Criteria To Be Used in Decomposing Systems into Modules
  - id: liskov-wing
    resource: https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf
    title: A Behavioral Notion of Subtyping
  - id: dependability
    resource: https://www.landwehr.org/2004-aviz-laprie-randell.pdf
    title: Basic Concepts and Taxonomy of Dependable and Secure Computing
  - id: protection
    resource: https://web.cs.wpi.edu/~cs557/f14/papers/saltzer1975_alt.html
    title: The Protection of Information in Computer Systems
  - id: slsa
    resource: https://slsa.dev/spec/v1.2/
    title: SLSA specification 1.2
  - id: nist-ssdf
    resource: https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-218.pdf
    title: NIST SP 800-218 Secure Software Development Framework 1.1
  - id: iso-25010
    resource: https://www.iso.org/standard/78176.html
    title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
  - id: iso-25010-preview
    resource: https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf
    title: ISO/IEC 25010:2023 public preview
  - id: iso-9126
    resource: https://www.iso.org/standard/22749.html
    title: ISO/IEC 9126-1:2001 Software engineering — Product quality — Part 1, Quality model
  - id: mccall
    resource: https://www.scribd.com/document/418348872/Factors-in-Software-Quality-Concept-and-Definitions-of-Software-Quality-Jim-A-McCall-Paul-K-Richard-Gene-F-Walters
    title: Factors in Software Quality — Volume I, Concept and Definitions of Software Quality
  - id: boehm
    resource: https://citeseerx.ist.psu.edu/document?doi=b79adbdb51a0be5f9d9fdbf731bc31d1ff43747d&repid=rep1&type=pdf
    title: Quantitative Evaluation of Software Quality
  - id: furps
    resource: https://public.dhe.ibm.com/software/rational/docs/v2003/unix_solutions/pdf/reqpro/reqpro_user.pdf
    title: IBM Rational RequisitePro User's Guide
  - id: dromey
    resource: https://research-repository.griffith.edu.au/bitstream/10072/15682/1/3476.pdf
    title: A Model for Software Product Quality
  - id: brooks
    resource: https://soloway.pbworks.com/f/The.Mythical.Man.Month.F.Brooks.pdf
    title: The Mythical Man-Month — Essays on Software Engineering, Anniversary Edition
  - id: lehman
    resource: https://users.ece.utexas.edu/~perry/education/SE-Intro/lehman.pdf
    title: Programs, Life Cycles, and Laws of Software Evolution
  - id: dora
    resource: https://dora.dev/guides/dora-metrics/
    title: DORA software delivery performance metrics
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Software quality pillars

This concept proposes ten foundational quality outcomes for codebase review.
It is a research-grounded candidate taxonomy, not a universal model, scorecard,
or claim that software quality naturally has ten dimensions.

The design prioritizes conceptual coherence, peer-level boundaries, durable
meaning, and source support over familiar repository-review groupings.

The set is a synthesis over historical and current quality models rather than a
list any one of them asserts. It starts from the product-quality scope of
ISO/IEC 25010:2023[^iso-25010][^iso-25010-preview] and its 9126
predecessor,[^iso-9126] and takes its category lessons from the models that came
before: a lifecycle grouping does not make every named factor an independent
peer,[^mccall] a hierarchy relates qualities without validating weights or an
aggregate score,[^boehm] required behavior and imposed constraints must not be
flattened into one quality list,[^furps] and reviewable product properties
should be related to outcomes rather than mistaken for them.[^dromey]

Three departures from 25010 are deliberate. Suitability is separated from
correctness, because a product can implement a stated contract correctly while
the contract is incomplete for the need. Maintainability and flexibility sit
under one Evolvability pillar, because continuing change is intrinsic to
software coupled to a changing environment.[^lehman] Intelligibility is a pillar
rather than a proxy for the cost of a future edit.[^brooks]

One familiar candidate is refused. Delivery capability is a quality of the
delivery system rather than of the product, and it mixes throughput with
instability unless carefully decomposed, so it stays outside the ten.[^dora]

No located source establishes that these ten are independent, collectively
exhaustive, or optimal for repository review, and the cardinality of ten is an
editorial constraint.

## Decision in brief

Use the repository as an **evidence surface** for judging the quality of a
software product. Keep the ten pillars at the **quality-outcome layer**:

| ID | Pillar | Core question |
| --- | --- | --- |
| `SQ-01` | Suitability | Does the product provide a complete and appropriate capability set for its intended needs and operating context? |
| `SQ-02` | Correctness | Does the product's behavior conform to its applicable contracts and preserve its declared invariants? |
| `SQ-03` | Reliability | Does required service remain dependable over time, faults, load, interruption, and recovery? |
| `SQ-04` | Security | Does the product preserve authorized protection of information, authority, identity, and operation against relevant threats? |
| `SQ-05` | Safety | Does the product keep the risk of unacceptable harm within its declared tolerances across use, misuse, failure, and integration? |
| `SQ-06` | Efficiency | Does required behavior meet its time, capacity, resource, and cost constraints for representative workloads? |
| `SQ-07` | Usability | Can intended users understand and operate the product to accomplish relevant goals with acceptable effort and error risk? |
| `SQ-08` | Compatibility | Does the product coexist and exchange meaning with required systems and environments without unacceptable interference? |
| `SQ-09` | Evolvability | Can the product accommodate required change over its lifetime without disproportionate risk, delay, or cost? |
| `SQ-10` | Intelligibility | Can qualified maintainers form an accurate, coherent, appropriately bounded mental model of the product? |

The names are singular semantic heads. Each can contain multiple subordinate
dimensions without becoming a compound pillar. The list order is for stable
reference, not priority.

## Assessment universe

The assessed entity is the **software product**, including its source,
configuration, data definitions, generated elements, and externally observable
behavior where they are in scope. The **repository** is the principal evidence
surface. It can expose internal product properties, intended contracts,
engineering history, and the systems used to construct and verify the product.

That distinction prevents three common overclaims:

- repository evidence can support but cannot alone establish every runtime or
  quality-in-use outcome;
- the presence of a test, scan, pipeline, metric, or document does not prove
  the quality it is intended to support; and
- a quality of the development or delivery system is not automatically a
  quality of the product.

If a future collection needs to assess the engineering system itself, give it
a separately named outcome model. Do not silently mix product qualities,
delivery performance, evidence quality, and development practices in one flat
set of ten.

## Pillar boundaries

Every pillar owns one desired product quality, not a review method or a bundle
of unrelated concerns.

### `SQ-01` — Suitability

**Desired outcome:** the product's capability set is complete and appropriate
for the intended stakeholders, goals, and operating context.

It includes missing, unnecessary, and ill-fitted capabilities. It excludes
whether implemented behavior faithfully conforms to an already accepted
contract; that belongs to correctness. Repository evidence may be insufficient
when stakeholder needs or real usage are unavailable.

### `SQ-02` — Correctness

**Desired outcome:** observable behavior conforms to applicable contracts, and
defined invariants hold across applicable conditions and state transitions.

It includes computations, control flow, data meaning, boundary behavior,
state, concurrency, and error semantics. It excludes whether the governing
contract is the right one. Proofs, tests, type checks, and review are evidence
mechanisms, not correctness itself. Dijkstra and Hoare ground correctness in
specification, assumptions, and reasoning rather than successful samples
alone.[^dijkstra][^hoare]

### `SQ-03` — Reliability

**Desired outcome:** the product delivers required service with acceptable
continuity and predictability across time, demand, faults, interruption, and
recovery.

It includes faultlessness, availability, tolerance, recoverability, and
bounded degradation. It excludes protection against adversaries and avoidance
of unacceptable harm as primary judgments. Dependability research is
especially useful here because it separates attributes, threats, and means
such as fault prevention, tolerance, removal, and forecasting.[^dependability]

### `SQ-04` — Security

**Desired outcome:** the product resists unauthorized or malicious action while
preserving the authorized confidentiality, integrity, authenticity,
accountability, and availability of relevant assets and operations.

It includes protection across trust boundaries and can include source-to-
artifact integrity when that chain is in product scope. Least privilege,
fail-safe defaults, complete mediation, signatures, scans, and provenance are
principles or evidence—not the outcome itself.[^protection][^slsa][^nist-ssdf]

### `SQ-05` — Safety

**Desired outcome:** product behavior keeps the risk of unacceptable harm
within declared tolerances.

It includes harm arising from intended use, reasonably foreseeable misuse,
failure, and integration. Safety can conflict with availability: stopping
service may be the safe result. It is context-dependent and may legitimately
be `Not applicable`, but hiding it inside reliability or security would erase
that distinct consequence.

### `SQ-06` — Efficiency

**Desired outcome:** the product delivers required behavior within justified
time, capacity, resource, and economic constraints.

It includes latency, throughput, capacity, computational work, memory,
storage, network use, and cost per useful result. A benchmark, profile, or
complexity metric is evidence about a bounded property, not efficiency as a
whole.

### `SQ-07` — Usability

**Desired outcome:** intended users can recognize, learn, control, and use the
product to achieve their relevant goals with acceptable effort and error risk.

It includes operability, learnability, inclusivity, assistance, and protection
from user error. It concerns the product's intended users, not maintainer
comprehension of source; the latter belongs to intelligibility. Its
applicability and evidence differ for an internal library, command-line tool,
public interface, and autonomous service.

### `SQ-08` — Compatibility

**Desired outcome:** the product coexists and exchanges meaning with required
systems and environments without unacceptable interference.

It includes interoperability, protocol and data agreement, coexistence, and
behavioral substitutability at shared boundaries. It excludes the future
capacity to adapt to a new environment, which belongs to evolvability. Static
type compatibility alone does not establish behavioral substitution.[^liskov-wing]

### `SQ-09` — Evolvability

**Desired outcome:** the product can accommodate required internal and
environmental change over its lifetime at sustainable risk, delay, and cost.

It includes modifiability, adaptability, installability, replaceability,
scalability, migration capacity, and sustainable dependency evolution.
Modular boundaries and information hiding are design contributors, while
change history and representative change exercises are evidence. Parnas shows
why the number of modules or a visually layered structure is not itself the
outcome.[^parnas]

### `SQ-10` — Intelligibility

**Desired outcome:** qualified maintainers can form an accurate, coherent, and
appropriately bounded mental model of the product's concepts, responsibilities,
behavior, and structure.

It includes conceptual integrity, comprehensibility, localized meaning, and
controlled accidental complexity. Naming, abstraction, documentation, and
module design are contributors. A small file, low cyclomatic-complexity value,
or absence of duplication is not sufficient evidence of intelligibility.

## High-risk boundary tests

Use these distinctions when a concern appears to fit more than one pillar.
Record cross-pillar consequences, but give the underlying condition one
canonical owner.

| Neighbors | Canonical distinction |
| --- | --- |
| Suitability / correctness | Suitability asks whether the accepted capability set addresses the right need; correctness asks whether behavior conforms to the accepted contract. |
| Correctness / reliability | Correctness is contract conformance for applicable behavior; reliability concerns continuity and recovery over time and faults. A consistently wrong result can be reliable. |
| Reliability / safety | Reliability favors continued required service; safety favors bounded harm and may require service to stop. |
| Reliability / security | Reliability includes accidental faults and service continuity; security includes adversarial action and authorization. Availability can be relevant to both, but the threat and claim differ. |
| Security / safety | Security protects authorized assets and operation against threats; safety bounds unacceptable harm regardless of whether its cause is malicious. |
| Efficiency / reliability | Efficiency owns resource and timing constraints; reliability owns continuity and recovery. Resource exhaustion can create a linked finding in both. |
| Suitability / usability | Suitability asks whether the product provides the needed capability; usability asks whether intended users can successfully operate it. |
| Usability / intelligibility | Usability concerns intended product users; intelligibility concerns qualified maintainers reasoning about the product. |
| Compatibility / correctness | Correctness owns conformance to the product's declared behavior; compatibility owns successful coexistence and exchange across an external relationship. |
| Compatibility / evolvability | Compatibility is fit with required present environments; evolvability is capacity to accommodate future change. |
| Evolvability / intelligibility | Evolvability is sustainable change capacity; intelligibility is accurate comprehension. Each contributes to the other but neither guarantees it. |

The pillars are related rather than statistically independent. Record
`contributes-to`, `evidences`, `threatens`, and `trades-off-with` relationships
instead of forcing every observation into a single causal story;
[Cross-cutting concerns for software quality](cross-cutting-concerns.md)
defines those edge types.

## Keep supporting layers outside the ten

Most of what a review looks at is not a pillar. Organize the rest by role
rather than promoting every useful topic to a quality outcome.

| Layer | Question answered | Examples |
| --- | --- | --- |
| Quality outcome | What desirable state should the product possess? | The ten pillars |
| Subquality | Which narrower dimension constitutes an outcome? | Availability, recoverability, authenticity, learnability, modifiability |
| Supporting-artifact quality | What desirable state should a specification, test suite, model, or other supporting artifact possess? | Test-suite value, specification clarity, model consistency |
| Design principle | What rule tends to create or preserve qualities? | Abstraction, information hiding, behavioral substitutability, least privilege |
| Engineering-system capability | What durable ability helps construct, change, deliver, operate, or learn from the product? | Dependency control, deterministic builds, task graphs, delivery automation, telemetry instrumentation |
| Assurance mechanism | What produces grounds for believing a quality claim? | Tests, proofs, reviews, static analysis, benchmarks, monitoring, attestations |
| Evidence property | What makes those grounds usable for this judgment? | Relevance, validity, provenance, freshness, scope binding, integrity, sufficient completeness |

The engineering-system capability row is the one whose members are owned
outside this framework, and each has a named home.

| Capability | Owner |
| --- | --- |
| Task graphs, dependency control, and the repository surface those run through | [Designing a coherent repository task interface](../repository-task-interface.md) |
| Delivery automation and the pipelines that run a task | [How to ship it](../../delivery/) |
| Telemetry instrumentation and the operational signals it produces | [How to run it](../../operations/) |
| Deterministic and reproducible construction | No owner in this bundle yet; the Construction area of [How to build it](../) is unwritten |

This separation is not a demotion of testing, modular design, build coherence,
or observability. It lets each support every quality it actually informs
without pretending to be the quality outcome itself. Product testability is how
readily product qualities can be investigated; test-suite quality is how
valuable and sustainable the tests are as evidence, and the separate
[Test-suite quality criteria](supporting/test-suite-quality.md) records that
verdict; product quality is what the resulting evidence is intended to justify.

## Judging a product, not sustaining one

These pillars judge a codebase against a declared claim on the evidence
available at a stated revision. Three of them name outcomes that a running
system must also be sustained against, and [How to run it](../../operations/)
owns that side. The split is by question, not by subject.

| Outcome | Judged here as | Sustained there as |
| --- | --- | --- |
| Reliability | Whether the product supports a stated dependability claim on available evidence | Capacity, resilience, graceful degradation, and recovery under live demand |
| Security | Whether the product preserves authorized protection against declared threats | Access, secrets, patching, and audit for a running system |
| Efficiency | Whether required behavior meets its declared time, capacity, resource, and cost envelope | Ownership, on-call load, and retiring systems that still run |

A verdict here is a bounded judgment at a revision, not a statement about
production. A healthy production record is not a passing review, and a passing
review is not evidence that the live system holds.

## Applicability and use

Apply all ten as candidate questions, but allow `Not applicable`,
`Indeterminate`, and `Not assessed` as defined in
[Reviewing a codebase](reviewing-a-codebase.md). A reusable library, interactive
application, embedded controller, data pipeline, and network service will
produce different applicability and evidence profiles.

Do not publish a summed quality score. The pillars have no justified universal
weights, can conflict, and can have veto-like importance in particular
contexts. Record scope, stakeholder, scenario, evidence, uncertainty, and
cross-pillar tradeoffs with each judgment.

The pillars change slowly, and the ways a reviewer gathers evidence about them
change quickly. Revise a pillar only when the desired property, scope, or
consequence changed — not because a new tool, metric, or model offers another
way to inspect it, and not to preserve a count. When observed use contradicts
the synthesis, merge, split, or retire a pillar deliberately and record why;
structural and source review can support this candidate, but representative
comparative use is required before claiming review effectiveness.

[^dijkstra]: Dijkstra, [Notes on Structured Programming](https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html).
[^hoare]: Hoare, [An Axiomatic Basis for Computer Programming](https://sites.cs.ucsb.edu/~kemm/courses/cs266/acmhoare69.pdf).
[^parnas]: Parnas, [On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html).
[^liskov-wing]: Liskov and Wing, [A Behavioral Notion of Subtyping](https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf).
[^dependability]: Avizienis, Laprie, Randell, and Landwehr, [Basic Concepts and Taxonomy of Dependable and Secure Computing](https://www.landwehr.org/2004-aviz-laprie-randell.pdf).
[^protection]: Saltzer and Schroeder, [The Protection of Information in Computer Systems](https://web.cs.wpi.edu/~cs557/f14/papers/saltzer1975_alt.html).
[^slsa]: SLSA, [Specification 1.2](https://slsa.dev/spec/v1.2/).
[^nist-ssdf]: NIST, [Secure Software Development Framework 1.1](https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-218.pdf).
[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^iso-25010-preview]: ISO/IEC, [ISO/IEC 25010:2023 public preview](https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf).
[^iso-9126]: ISO, [ISO/IEC 9126-1:2001 lifecycle page](https://www.iso.org/standard/22749.html).
[^mccall]: McCall, Richards, and Walters, [Factors in Software Quality, Volume I](https://www.scribd.com/document/418348872/Factors-in-Software-Quality-Concept-and-Definitions-of-Software-Quality-Jim-A-McCall-Paul-K-Richard-Gene-F-Walters).
[^boehm]: Boehm, Brown, and Lipow, [Quantitative Evaluation of Software Quality](https://citeseerx.ist.psu.edu/document?doi=b79adbdb51a0be5f9d9fdbf731bc31d1ff43747d&repid=rep1&type=pdf).
[^furps]: IBM Rational, [RequisitePro User's Guide](https://public.dhe.ibm.com/software/rational/docs/v2003/unix_solutions/pdf/reqpro/reqpro_user.pdf).
[^dromey]: Dromey, [A Model for Software Product Quality](https://research-repository.griffith.edu.au/bitstream/10072/15682/1/3476.pdf).
[^lehman]: Lehman, [Programs, Life Cycles, and Laws of Software Evolution](https://users.ece.utexas.edu/~perry/education/SE-Intro/lehman.pdf).
[^brooks]: Brooks, [The Mythical Man-Month, anniversary edition](https://soloway.pbworks.com/f/The.Mythical.Man.Month.F.Brooks.pdf).
[^dora]: DORA, [Software delivery performance metrics](https://dora.dev/guides/dora-metrics/).
