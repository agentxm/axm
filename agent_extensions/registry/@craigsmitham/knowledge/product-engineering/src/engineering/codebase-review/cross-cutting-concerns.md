---
type: Explainer
title: Cross-cutting concerns for software quality
description: Defines what makes a concern cross-cutting rather than an eleventh quality pillar, defines the eight canonical records with their inclusions and exclusions, supplies the seven typed edges that reach the quality pillars, and gives the subject, role, and admission tests every candidate record must pass.
tags: [codebase-review, software-quality, cross-cutting-concerns, taxonomy, classification, relationship-types, admission-gate, pe-engineering]
status: draft
sources:
  - id: iso-25010
    resource: https://www.iso.org/standard/78176.html
    title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
  - id: iso-25030
    resource: https://www.iso.org/standard/72116.html
    title: ISO/IEC 25030:2019 Systems and software Quality Requirements and Evaluation — Quality requirements framework
  - id: iso-25040
    resource: https://www.iso.org/standard/83467.html
    title: ISO/IEC 25040:2024 Systems and software Quality Requirements and Evaluation — Quality evaluation framework
  - id: iso-25020
    resource: https://www.iso.org/standard/72117.html
    title: ISO/IEC 25020:2019 Systems and software Quality Requirements and Evaluation — Quality measurement framework
  - id: iso-15939
    resource: https://www.iso.org/standard/71197.html
    title: ISO/IEC/IEEE 15939:2017 Systems and software engineering — Measurement process
  - id: iso-42010
    resource: https://www.iso.org/standard/74393.html
    title: ISO/IEC/IEEE 42010:2022 Software, systems and enterprise — Architecture description
  - id: iso-15026-1
    resource: https://www.iso.org/standard/73567.html
    title: ISO/IEC/IEEE 15026-1:2019 Systems and software assurance — Concepts and vocabulary
  - id: iso-15026-2
    resource: https://www.iso.org/standard/80625.html
    title: ISO/IEC/IEEE 15026-2:2022 Systems and software assurance — Assurance case
  - id: kiczales
    resource: https://www.cs.ubc.ca/~gregor/papers/kiczales-icse05-aopmr.pdf
    title: Aspect-Oriented Programming and Modular Reasoning
  - id: dependability
    resource: https://www.landwehr.org/2004-aviz-laprie-randell.pdf
    title: Basic Concepts and Taxonomy of Dependable and Secure Computing
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Cross-cutting concerns for software quality

This concept defines how concerns that affect several
[software quality pillars](software-quality-pillars.md) should be represented
without turning them into additional product qualities or a miscellaneous
topic list. It is a research-grounded candidate model, not a claim that every
codebase has eight such concerns or that every relationship always applies.

The central rule is:

> A concern is cross-cutting because a coherent subject or mechanism has
> explicit, conditional relationships to several product-quality outcomes—not
> because it is broadly important or difficult to place.

Cross-cutting is therefore a relationship pattern. It is not an ontological
role. A design principle, engineering-system capability, assurance mechanism,
evidence property, or contextual condition can cross several pillars while
remaining a different kind of thing from those pillars. This use extends the
software-design idea that cross-cutting depends on the chosen decomposition:
a concern cuts across one primary organization while retaining its own
coherent identity.[^kiczales]

## Decision in brief

Keep eight canonical records with singular semantic heads. Present them in
three roles so the two universal envelopes are not mistaken for six topical
concerns of the same kind.

| ID | Record | Presentation role | Primary assessment subject | Primary conceptual role | Core question |
| --- | --- | --- | --- | --- | --- |
| `XC-01` | Claim context | Framing envelope | Context or environment | Contextual condition | Under exactly which subject, stakeholder, use, environment, lifecycle, and consequence conditions is a quality claim intended to hold? |
| `XC-02` | Specification | Concern family | Supporting artifact | Supporting-artifact quality | Are intended needs, required qualities, behavioral contracts, invariants, and acceptance bounds explicit and traceable enough to govern the relevant product claims? |
| `XC-03` | Structure | Concern family | Product or system in use | Design principle | Does the product concentrate decisions, responsibilities, dependencies, authority, and complexity into coherent boundaries that preserve the qualities they are meant to support? |
| `XC-04` | Lifecycle integrity | Concern family | Engineering system | Engineering-system capability | Can relevant versions, changes, configurations, dependencies, builds, releases, migrations, and provenance remain identified, controlled, reproducible, and recoverable across the lifecycle? |
| `XC-05` | Risk | Concern family | Decision relationship | Threat | Are relevant faults, threats, hazards, misuse, sensitivities, interactions, and quality tradeoffs understood relative to declared tolerances? |
| `XC-06` | Assurance | Concern family | Assurance or evidence corpus | Assurance mechanism | Does a proportionate portfolio of verification and validation activities produce grounds for believing the applicable quality claims? |
| `XC-07` | Feedback | Concern family | Engineering system | Engineering-system capability | Can product behavior and effects be detected, interpreted, connected to decisions, and used to correct or improve the product and its governing assumptions? |
| `XC-08` | Evidence | Evaluation envelope | Assurance or evidence corpus | Evidence property | Is the evidence relevant, valid, representative, attributable, fresh, sufficiently complete, and explicit about uncertainty for the claim it supports? |

The names are stable labels, not compressed definitions. “Claim context” and
“Evidence” apply to every assessment. The six concern families are considered
only where applicable. None is an eleventh product-quality pillar, and none
receives a product-quality verdict in place of the ten pillars.

This separation follows a recurring pattern across authoritative sources:
product-quality models describe desired characteristics; requirements
frameworks connect needs to quality requirements; evaluation and measurement
frameworks govern how target entities are assessed; architecture-description
standards distinguish the entity from its representation; and assurance
standards connect claims to arguments and evidence.[^iso-25010][^iso-25030][^iso-25040][^iso-25020][^iso-42010][^iso-15026-1][^iso-15026-2]

## Define the eight records

Each record has one semantic head, a bounded set of inclusions, and explicit
exclusions. None receives a product-quality verdict.

### `XC-01` — Claim context

**Definition:** the declared conditions that give a quality claim its subject,
meaning, applicability, required confidence, and limits.

**Includes:** target entity and version; stakeholders and intended uses;
operating and integration environments; lifecycle stage; workloads and
scenarios; consequence and criticality; risk tolerance; assumptions;
exclusions; and the distinction among `Not applicable`, `Not assessed`, and
insufficient evidence.

**Excludes:** the content of the specification, the method of review, and the
evidence used to justify the verdict.

### `XC-02` — Specification

**Definition:** the quality of the explicit intent, requirements, contracts,
invariants, bounds, and trace relationships that govern product judgments.

**Includes:** functional and quality requirements; acceptance conditions;
interface and protocol contracts; data meaning; legal states; error and
recovery semantics; compatibility commitments; security and safety
constraints; and bidirectional traceability through changes and evidence.

**Excludes:** whether the implemented product conforms, whether the requirement
is socially or commercially valuable, and any one notation or format.

### `XC-03` — Structure

**Definition:** the discipline with which the product localizes changeable
decisions, responsibility, authority, state, dependency, and complexity into
coherent boundaries.

**Includes:** information hiding; modular and package boundaries; cohesion and
coupling; dependency direction; interface size and stability; ownership of
state and effects; representation choices; concurrency boundaries; and
justified complexity.

**Excludes:** the product-level outcomes of intelligibility and evolvability,
prescriptive pattern catalogs, and uncalibrated proxies such as file length or
number of abstractions.

### `XC-04` — Lifecycle integrity

**Definition:** the engineering system's ability to preserve the identity,
control, reproducibility, provenance, and recoverability of product states and
changes over time.

**Includes:** configuration identification; dependency and toolchain
resolution; change control and status; reproducible construction; generated
artifact ownership; build and release lineage; source and artifact provenance;
migration, compatibility, and rollback paths; retirement; and recovery from a
partial lifecycle operation.

**Excludes:** the throughput of a delivery team, the security or correctness of
the resulting product, and a mandate for one branching, packaging, or
deployment method.

### `XC-05` — Risk

**Definition:** the explicit reasoning that connects uncertain faults, threats,
hazards, misuse, interactions, and tradeoffs to consequences and declared
tolerances.

**Includes:** relevant failure and attack scenarios; hazard and abuse analysis;
fault propagation; exposure and consequence; uncertainty and sensitivity;
quality-attribute conflicts; risk acceptance; compensating controls; and
residual risk.

**Excludes:** the product-quality outcomes themselves, a generic governance
program, and a universal severity or probability scale.

### `XC-06` — Assurance

**Definition:** the proportionate portfolio of verification and validation
mechanisms used to produce grounds for believing applicable quality claims.

**Includes:** tests, proofs, reviews, inspections, static and dynamic analysis,
benchmarks, simulations, security testing, safety analysis, operational
monitoring, audits, attestations, and appropriate independence or diversity.

**Excludes:** the product quality being claimed, the intrinsic quality of each
supporting artifact, and the assumption that activity volume equals confidence.

### `XC-07` — Feedback

**Definition:** the engineering system's ability to detect and interpret
product behavior and effects, connect them to decisions, and support timely
correction or learning.

**Includes:** runtime observability and diagnosability; traces, metrics, logs,
profiles, and health signals; user and operator feedback; incident and defect
learning; change-impact feedback; escalation; and the latency and reach of
feedback loops.

**Excludes:** reliability itself, telemetry volume as a proxy for insight, and
a requirement that every product use production monitoring.

### `XC-08` — Evidence

**Definition:** the fitness of information to support a specific quality claim
and decision within a declared context.

**Includes:** claim binding; relevance; construct validity; representativeness;
measurement reliability; provenance and integrity; scope and version identity;
freshness; independence; completeness; uncertainty; contradictory results; and
limitations.

**Excludes:** the assurance activity that generated the information, the
verdict it informs, and any assumption that a metric or majority opinion is
intrinsically authoritative.

## Type the relationships to the pillars

Each record reaches a pillar through directed, conditional edges. Use these
types; do not write a bare “relates to” edge.

| Code | Relationship | Meaning |
| --- | --- | --- |
| `CON` | Constitutes | The source is part of the definition of the target outcome; use rarely because most cross-cutting records should not constitute a pillar. |
| `CTR` | Contributes | The source can causally help or impair the target without being necessary or sufficient. |
| `EN` | Enables | The source makes achievement or assessment of the target feasible or materially easier. |
| `EV` | Evidences | The source can provide grounds for a judgment about the target. |
| `CS` | Constrains | The source sets scope, bounds, obligations, or decision conditions for the target. |
| `TH` | Threatens | The source describes a way the target can be impaired. |
| `TR` | Trades off | A decision involving the source may improve one target while impairing another. |

Every maintained edge records its direction, mechanism, applicability, evidence
basis, limitation or counterexample, and lifecycle scope. `CON` should stay
almost unused: a record that routinely constitutes one pillar is probably a
subquality of that pillar, and one that appears to constitute many is probably
a broad synonym for product quality. Claim context and Evidence constrain and
qualify every pillar; the other six apply conditionally.

## Place testing precisely

Testing occupies several positions because the word can name different subjects
and roles. Keep them apart.

| Term | Subject and role | Placement |
| --- | --- | --- |
| Product testability | Product; subquality | Primarily a subquality of Evolvability, whose presence affords assurance across any pillar whose behavior must be investigated |
| Testing | Review or lifecycle activity; assurance mechanism | `XC-06` Assurance; one member of a portfolio, not the product-quality outcome |
| Test-suite quality | Supporting-artifact quality | Assessed within Assurance and governed by `XC-08` Evidence; it asks whether tests are valuable and sustainable as grounds for claims |
| Test result | Evidence item | `XC-08` Evidence; its relevance, validity, provenance, representativeness, freshness, and limits determine what it can support |
| Test process | Review protocol or engineering-system practice | Method guidance outside the product pillars and outside these record definitions |
| Passing tests | Observation | Evidence for only the claims, versions, conditions, and oracles the tests actually cover; never a synonym for product quality |

## Classify by subject and role

Classify every future record on two independent axes before deciding whether
it belongs in this model.

### Assessment subjects

| Subject | What can be assessed |
| --- | --- |
| Product or system in use | Source, executable behavior, data, interfaces, and effects within declared scope |
| Supporting artifact | Requirement, contract, model, architecture description, test, runbook, or other representation |
| Engineering system | The capabilities used to construct, change, configure, deliver, operate, or learn from the product |
| Assurance or evidence corpus | The connected claims, arguments, activities, results, assumptions, and evidence used to justify judgments |
| Review activity | The protocol, perspective, procedure, model, reviewer, or tool performing an assessment |
| Context or environment | Stakeholders, goals, scenarios, dependencies, constraints, lifecycle stage, consequence, and operating conditions |
| Decision relationship | A threat, contribution, constraint, tradeoff, dependency, or evidentiary relationship among other entities |

Architecture guidance provides a useful precedent: the architecture of an
entity is distinct from an architecture description that expresses it, and
different concerns may require different viewpoints.[^iso-42010] The same
discipline prevents a good document, test suite, pipeline, or review process
from being mistaken for a good product.

### Conceptual roles

| Role | Meaning |
| --- | --- |
| Product-quality outcome | A desired quality of the software product; owned by one of the ten pillars |
| Subquality | A narrower dimension that constitutes part of a pillar |
| Supporting-artifact quality | A desired quality of a specification, test suite, model, or other supporting artifact |
| Design principle | A defeasible rule for shaping the product so it tends to preserve qualities |
| Engineering-system capability | A durable ability to construct, change, deliver, operate, or learn from the product |
| Assurance mechanism | An activity or control that produces grounds for a quality claim |
| Evidence property | A property that makes information fit or unfit to support a particular claim |
| Review protocol | A procedure for selecting scope, gathering evidence, judging, and reporting |
| Metric or measure | An operationalized observation intended to answer a stated information need |
| Heuristic | A fallible shortcut whose usefulness depends on context and calibration |
| Contextual condition | A fact that changes a claim's meaning, applicability, priority, or required confidence |
| Threat | A circumstance or event that can impair an outcome |
| Tradeoff | A relationship in which improving or preserving one concern can impair another |

Dependability research likewise separates desired attributes, impairments,
and the means used to attain confidence rather than flattening all three into
one list.[^dependability] Measurement standards start from information needs
and require attention to the validity of analysis results; a metric is not the
quality it is intended to indicate.[^iso-15939][^iso-25020]

## Admit only genuine cross-cutting records

A candidate belongs in this model only when it passes this gate:

1. **Different role:** it is not merely another name for a product pillar or
   one of its subqualities.
2. **Coherent kernel:** it has one stable semantic head, a bounded definition,
   and inclusion and exclusion rules.
3. **Explicit mechanism:** it can explain how it constrains, enables,
   contributes to, evidences, threatens, or trades off with a pillar.
4. **Material breadth:** it has material relationships to several pillars in
   meaningfully different quality domains, not repeated wording with no causal
   or evidentiary account.
5. **Non-reduction:** no single pillar can own the concern without hiding
   material relationships to other pillars.
6. **Independent assessability:** its own subject can receive a meaningful
   judgment without substituting for the verdict on a linked pillar.
7. **Portability:** its semantic kernel survives changes in technology,
   repository shape, lifecycle method, and review tool.
8. **Conditionality:** it can state when a relationship applies, does not
   apply, or cannot be judged.
9. **Evidence discipline:** it does not treat the presence of a mechanism,
   artifact, signal, or metric as proof of the outcome.
10. **Outcome orientation:** it can guide assessment without prescribing one
    universal implementation or inspection sequence.

Records must pass 1–5 and 7. Failure on 6, 8, 9, or 10 calls for revision or
placement as a contextual aid rather than a canonical concern. As a
provisional editorial check, require a candidate to show material links to at
least four pillars spanning at least three distinct quality domains. Test the
classification at thresholds of three and five during validation. This
numeric threshold is a design convention from this synthesis, not a rule
established by the cited sources.

Broad labels such as *trustworthiness*, *overall quality*, and *dependability*
fail the non-reduction test beside the ten pillars. Narrow outcomes such as
availability, testability, accessibility, modularity, and performance usually
belong under a pillar or one typed record. Named practices such as TDD, SOLID,
DRY, static analysis, logging, automation, and code review are mechanisms,
principles, or heuristics until a more precise outcome and subject are stated.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^iso-25030]: ISO, [ISO/IEC 25030:2019 quality requirements framework](https://www.iso.org/standard/72116.html).
[^iso-25040]: ISO, [ISO/IEC 25040:2024 quality evaluation framework](https://www.iso.org/standard/83467.html).
[^iso-25020]: ISO, [ISO/IEC 25020:2019 quality measurement framework](https://www.iso.org/standard/72117.html).
[^iso-15939]: ISO, [ISO/IEC/IEEE 15939:2017 measurement process](https://www.iso.org/standard/71197.html).
[^iso-42010]: ISO, [ISO/IEC/IEEE 42010:2022 architecture description](https://www.iso.org/standard/74393.html).
[^iso-15026-1]: ISO, [ISO/IEC/IEEE 15026-1:2019 assurance concepts and vocabulary](https://www.iso.org/standard/73567.html).
[^iso-15026-2]: ISO, [ISO/IEC/IEEE 15026-2:2022 assurance case](https://www.iso.org/standard/80625.html).
[^kiczales]: Kiczales and Mezini, [Aspect-Oriented Programming and Modular Reasoning](https://www.cs.ubc.ca/~gregor/papers/kiczales-icse05-aopmr.pdf).
[^dependability]: Avizienis, Laprie, Randell, and Landwehr, [Basic Concepts and Taxonomy of Dependable and Secure Computing](https://www.landwehr.org/2004-aviz-laprie-randell.pdf).
