---
type: Explainer
title: Cross-cutting concerns for software quality
description: Research-grounded model of eight typed cross-cutting concern records and their conditional relationships to the ten software-product quality pillars.
tags: [codebase-review, software-quality, cross-cutting-concerns, taxonomy, assurance, evidence, research, maintenance]
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
  - id: sacm
    resource: https://www.omg.org/spec/SACM/2.3/About-SACM
    title: OMG Structured Assurance Case Metamodel 2.3
  - id: kiczales
    resource: https://www.cs.ubc.ca/~gregor/papers/kiczales-icse05-aopmr.pdf
    title: Aspect-Oriented Programming and Modular Reasoning
  - id: parnas
    resource: https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html
    title: On the Criteria To Be Used in Decomposing Systems into Modules
  - id: atam
    resource: https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/
    title: Architecture Tradeoff Analysis Method collection
  - id: dependability
    resource: https://www.landwehr.org/2004-aviz-laprie-randell.pdf
    title: Basic Concepts and Taxonomy of Dependable and Secure Computing
  - id: swebok
    resource: https://ieeecs-media.computer.org/media/education/swebok/swebok-v4.pdf
    title: Guide to the Software Engineering Body of Knowledge, Version 4.0
  - id: nist-ssdf
    resource: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf
    title: NIST SP 800-218 Secure Software Development Framework 1.1
  - id: slsa
    resource: https://slsa.dev/spec/v1.2/verifying-artifacts
    title: SLSA 1.2 — Verifying artifacts
  - id: nasa-assurance
    resource: https://standards.nasa.gov/sites/default/files/standards/NASA/B/0/NASA-STD-87398RevB.pdf
    title: NASA-STD-8739.8B Software Assurance and Software Safety Standard
  - id: ieee-1012
    resource: https://standards.ieee.org/ieee/1012/7324/
    title: IEEE 1012-2024 Standard for System, Software, and Hardware Verification and Validation
  - id: opentelemetry
    resource: https://opentelemetry.io/docs/concepts/signals/
    title: OpenTelemetry signals
  - id: google-sre
    resource: https://sre.google/sre-book/monitoring-distributed-systems/
    title: Google SRE — Monitoring Distributed Systems
  - id: test-desiderata
    resource: https://testdesiderata.com/
    title: Test Desiderata
  - id: pstack
    resource: https://github.com/cursor/plugins/tree/main/pstack
    title: Cursor plugins — pstack
  - id: nist-ai-rmf
    resource: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
    title: NIST AI Risk Management Framework — Core
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
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

## Define the eight records

### `XC-01` — Claim context

**Definition:** the declared conditions that give a quality claim its subject,
meaning, applicability, required confidence, and limits.

It includes the target entity and version; stakeholders and intended uses;
operating and integration environments; lifecycle stage; workloads and
scenarios; consequence and criticality; risk tolerance; assumptions;
exclusions; and the distinction among `Not applicable`, `Not assessed`, and
insufficient evidence. It excludes the content of the specification, the
method of review, and the evidence used to justify the verdict.

Claim context constrains every pillar. A codebase cannot by itself establish
whether a capability addresses the right stakeholder need, whether a workload
is representative, or how much assurance a safety-relevant decision requires.
Quality-requirements guidance is explicitly stakeholder- and purpose-aware and
does not prescribe one quality measure or development process.[^iso-25030]

### `XC-02` — Specification

**Definition:** the quality of the explicit intent, requirements, contracts,
invariants, bounds, and trace relationships that govern product judgments.

It includes functional and quality requirements; acceptance conditions;
interface and protocol contracts; data meaning; legal states; error and
recovery semantics; compatibility commitments; security and safety
constraints; and bidirectional traceability through changes and evidence. It
excludes whether the implemented product conforms, whether the requirement is
socially or commercially valuable, and any one notation or documentation
format.

Specification enables and can be evidence for every pillar, but only when the
specified claim is itself accepted and applicable. It is especially important
to preserve the difference between verifying conformance and validating
fitness for intended use. Current V&V guidance treats both as distinct reasons
for assessment and permits analysis, review, inspection, testing, and other
means.[^ieee-1012]

### `XC-03` — Structure

**Definition:** the discipline with which the product localizes changeable
decisions, responsibility, authority, state, dependency, and complexity into
coherent boundaries.

It includes information hiding; modular and package boundaries; cohesion and
coupling; dependency direction; interface size and stability; ownership of
state and effects; representation choices; concurrency boundaries; and
justified complexity. It excludes the product-level outcomes of
intelligibility and evolvability, prescriptive pattern catalogs, and
uncalibrated proxies such as file length or number of abstractions.

Structure can contribute to every pillar, but its effects are conditional and
tradeoff-bearing. A boundary that aids change can increase latency; isolation
that improves fault containment can complicate usability or deployment.
Parnas grounds modularity in hiding changeable design decisions, while ATAM
uses concrete scenarios to expose quality interactions and architectural
tradeoffs rather than assuming one structure is universally best.[^parnas][^atam]

### `XC-04` — Lifecycle integrity

**Definition:** the engineering system's ability to preserve the identity,
control, reproducibility, provenance, and recoverability of product states and
changes over time.

It includes configuration identification; dependency and toolchain
resolution; change control and status; reproducible construction; generated
artifact ownership; build and release lineage; source and artifact provenance;
migration, compatibility, and rollback paths; retirement; and recovery from a
partial lifecycle operation. It excludes the throughput of a delivery team,
the security or correctness of the resulting product, and a mandate for one
branching, packaging, or deployment method.

Configuration management is treated as a lifecycle knowledge area in SWEBOK,
while secure-development and supply-chain frameworks connect controlled
changes, protected artifacts, and verified provenance to security claims.[^swebok][^nist-ssdf][^slsa]
Those controls enable evidence and reduce threats; their presence does not
prove that a build is correct, safe, or suitable.

### `XC-05` — Risk

**Definition:** the explicit reasoning that connects uncertain faults,
threats, hazards, misuse, interactions, and tradeoffs to consequences and
declared tolerances.

It includes relevant failure and attack scenarios; hazard and abuse analysis;
fault propagation; exposure and consequence; uncertainty and sensitivity;
quality-attribute conflicts; risk acceptance; compensating controls; and
residual risk. It excludes the product-quality outcomes themselves, a generic
governance program, and a universal severity or probability scale.

Risk constrains and can threaten every pillar. It also prevents a review from
assuming that all desirable properties can be maximized at once. Assurance and
safety standards tailor rigor to consequence and integrity needs, and ATAM
elicits scenario-specific risks, sensitivity points, and tradeoffs.[^nasa-assurance][^ieee-1012][^atam]

### `XC-06` — Assurance

**Definition:** the proportionate portfolio of verification and validation
mechanisms used to produce grounds for believing applicable quality claims.

It includes tests, proofs, reviews, inspections, static and dynamic analysis,
benchmarks, simulations, security testing, safety analysis, operational
monitoring, audits, attestations, and appropriate independence or diversity.
It excludes the product quality being claimed, the intrinsic quality of each
supporting artifact, and the assumption that activity volume equals
confidence.

Assurance enables and produces potential evidence for every pillar. The
portfolio should respond to claim type, context, consequence, uncertainty, and
the failure modes of its own methods. Assurance-case standards make the
relationship explicit by connecting claims through argument and assumptions
to evidence, while SACM provides a shared model for representing those
relationships.[^iso-15026-1][^iso-15026-2][^sacm]

### `XC-07` — Feedback

**Definition:** the engineering system's ability to detect and interpret
product behavior and effects, connect them to decisions, and support timely
correction or learning.

It includes runtime observability and diagnosability; traces, metrics, logs,
profiles, and health signals; user and operator feedback; incident and defect
learning; change-impact feedback; escalation; and the latency and reach of
feedback loops. It excludes reliability itself, telemetry volume as a proxy
for insight, and a requirement that every product use production monitoring.

Feedback provides operational evidence across the pillars and especially
enables reliability, security, safety, evolvability, and intelligibility when
runtime behavior matters. OpenTelemetry distinguishes signals and their
correlation, while SRE guidance emphasizes actionable, symptom-oriented
monitoring and the cost of noisy signals.[^opentelemetry][^google-sre]

### `XC-08` — Evidence

**Definition:** the fitness of information to support a specific quality claim
and decision within a declared context.

It includes claim binding; relevance; construct validity; representativeness;
measurement reliability; provenance and integrity; scope and version
identity; freshness; independence; completeness; uncertainty; contradictory
results; and limitations. It excludes the assurance activity that generated
the information, the verdict it informs, and any assumption that a metric or
majority opinion is intrinsically authoritative.

Evidence governs judgments across every pillar. Measurement frameworks require
measures to answer stated information needs and explicitly address validity
and reliability.[^iso-15939][^iso-25020] Quality evaluation is a process for
declared target entities and does not supply a universal test method.[^iso-25040]
Therefore evidence can be strong, weak, conflicting, insufficient, or
inapplicable without silently changing the quality outcome being assessed.

## Type the relationships to the pillars

Use these directed relationship types. Do not write a bare “relates to” edge.

| Code | Relationship | Meaning |
| --- | --- | --- |
| `CON` | Constitutes | The source is part of the definition of the target outcome; use rarely because most cross-cutting records should not constitute a pillar. |
| `CTR` | Contributes | The source can causally help or impair the target without being necessary or sufficient. |
| `EN` | Enables | The source makes achievement or assessment of the target feasible or materially easier. |
| `EV` | Evidences | The source can provide grounds for a judgment about the target. |
| `CS` | Constrains | The source sets scope, bounds, obligations, or decision conditions for the target. |
| `TH` | Threatens | The source describes a way the target can be impaired. |
| `TR` | Trades off | A decision involving the source may improve one target while impairing another. |

Every maintained edge should record its direction, mechanism, applicability,
evidence basis, limitation or counterexample, and lifecycle scope. The matrix
below is a compact discovery view, not a proof or an instruction to force a
finding into every cell. Parentheses mean the relationship is especially
context-dependent. An enabling edge refers to the record's desired state; a
threatening edge can refer to a deficiency in that state or to an adverse
element represented by the record.

| Record | Suitability | Correctness | Reliability | Security | Safety | Efficiency | Usability | Compatibility | Evolvability | Intelligibility |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Claim context | `CS` | `CS` | `CS` | `CS` | `CS` | `CS` | `CS` | `CS` | `CS` | `CS` |
| Specification | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `(EN·EV)` | `(EN·EV)` |
| Structure | `(CTR·TR)` | `CTR·EV` | `CTR` | `CTR·TR` | `CTR·TR` | `CTR·TR` | `(CTR·TR)` | `CTR·TR` | `CTR` | `CTR` |
| Lifecycle integrity | `(EN·TH)` | `EN·EV·TH` | `EN·EV·TH` | `EN·EV·TH` | `EN·EV·TH` | `(EN·EV)` | `(EN·TH)` | `EN·EV·TH` | `EN` | `EN·EV` |
| Risk | `TH·CS·TR` | `TH·CS·TR` | `TH·CS·TR` | `TH·CS·TR` | `TH·CS·TR` | `TH·CS·TR` | `TH·CS·TR` | `TH·CS·TR` | `TH·CS·TR` | `TH·CS·TR` |
| Assurance | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` | `EN·EV` |
| Feedback | `EV` | `EV` | `EN·EV` | `EN·EV·TH` | `EN·EV·TH` | `EV·TR` | `(EV·TR)` | `(EV)` | `EN·EV` | `EN·EV` |
| Evidence | `EV·CS·TR` | `EV·CS·TR` | `EV·CS·TR` | `EV·CS·TR` | `EV·CS·TR` | `EV·CS·TR` | `EV·CS·TR` | `EV·CS·TR` | `EV·CS·TR` | `EV·CS·TR` |

The matrix deliberately contains no `CON` edges. If a proposed cross-cutting
record routinely constitutes only one pillar, it is probably a subquality of
that pillar. If it appears to constitute many pillars, it is probably a broad
synonym for product quality rather than a useful cross-cutting record.

## Place testing and testability precisely

Testing occupies several positions because the word can name different
subjects and roles.

| Term | Subject and role | Placement |
| --- | --- | --- |
| Product testability | Product; subquality | Primarily a subquality of Evolvability in this taxonomy whose presence affords assurance across any pillar whose behavior must be investigated |
| Testing | Review or lifecycle activity; assurance mechanism | `XC-06` Assurance; one member of a portfolio, not the product-quality outcome |
| Test-suite quality | Supporting-artifact quality | Assessed within Assurance and governed by `XC-08` Evidence; it asks whether tests are valuable and sustainable as grounds for claims |
| Test result | Evidence item | `XC-08` Evidence; its relevance, validity, provenance, representativeness, freshness, and limits determine what it can support |
| Test process | Review protocol or engineering-system practice | Method guidance outside the product pillars and outside the stable concern definitions |
| Passing tests | Observation | Evidence for only the claims, versions, conditions, and oracles the tests actually cover; never a synonym for product quality |

Test Desiderata is therefore a valuable model for the **quality of tests**,
not a rival product-quality taxonomy. Its properties include isolation,
composability, determinism, speed, writability, readability, behavioral
sensitivity, structure insensitivity, automation, specificity, predictive
power, and confidence—and explicitly recognize interactions and
tradeoffs.[^test-desiderata] Those properties should inform Assurance and
Evidence criteria without being collapsed into product testability or treated
as independently maximizable scores.

The pstack plugin supplies a complementary practitioner datapoint. It combines
product goals, design principles, verification practices, model-coordination
protocols, and code-shape heuristics in one operating system.[^pstack] The
typed model preserves that useful material while routing it to Structure,
Assurance, Feedback, Evidence, or an optional method aid instead of treating
the entire operating system as a timeless quality category.

## Organize the knowledge as a lightweight hybrid

Use one canonical typed record for each concern, then derive or maintain
purpose-specific views:

```text
canonical typed records
    -> three-role orientation: context / six concern families / evidence
    -> concern-by-pillar relationship matrix
    -> pillar review criteria and cross-cutting review aids
    -> migration and validation reports
```

This combines the strengths of four organization forms:

| Form | Keep | Avoid |
| --- | --- | --- |
| Layered hierarchy | Fast orientation and clear distinction from product pillars | Pretending a concern has only one parent |
| Faceted classification | Independent subject and role axes | Uncontrolled tags with no definitions |
| Concern-by-pillar matrix | Visible gaps, overlaps, and conditional reach | Treating eighty cells as eighty mandatory checks |
| Typed relationship graph | Explicit direction and mechanism | Requiring graph tooling before the model proves useful |

Do not build a schema, generator, or scoring tool yet. The stable IDs,
definitions, typed tables, and links in this concept are the canonical source
for the draft. Introduce a machine-readable registry only if comparative use
shows that projections drift or that tools materially improve retrieval and
classification.

When a record becomes machine-readable, preserve at least:

- stable ID, label, aliases, definition, inclusion, and exclusion;
- one primary assessment subject and conceptual role;
- applicability by entity, stakeholder, environment, lifecycle, criticality,
  prerequisites, and explicit non-applicability;
- typed pillar edges with direction, mechanism, conditions, and limitations;
- the assurance claim or review question separately from supporting evidence;
- evidence sources and their validity, representativeness, freshness,
  sufficiency, provenance, and uncertainty limits;
- metrics with construct, unit, method, threshold basis, and uncertainty;
- heuristics marked as defeasible, including overrides and false positives;
- review procedures as separate aids;
- threats, tradeoffs, authority, provenance, version, review date, and known
  disagreement; and
- distinct states for unknown, not assessed, not applicable, and insufficient
  evidence.

## Keep the implementation outcome-first

The implemented criteria start from a pillar outcome and identify which
cross-cutting records materially affect its assessment. The framework does not
create eight additional ten-item checklists. A cross-cutting concept deserves a
separate checklist only when its own subject has a distinct review job and
verdict.

## Validate before treating the model as stable

This synthesis resolves the research alternatives, but it has not yet been
validated in representative reviews. Use four forms of validation:

1. **Classification trials:** have independent reviewers classify a held-out
   sample of criteria and findings by subject, role, canonical record, and
   relationship type. Analyze disagreements by field instead of collapsing
   them into one agreement score.
2. **Task trials:** test whether users can find a concern, explain why it is
   not a pillar, distinguish it from its nearest neighbor, and state when a
   pillar edge does not apply.
3. **Portability trials:** use libraries, interactive applications, services,
   data systems, embedded or safety-relevant systems, and multi-package
   repositories across different technology stacks.
4. **Review-performance trials:** compare the model with an unconstrained
   review, credible alternative quality models, and alternative layer
   presentations on material coverage, overlap, unsupported claims, false
   assurance, evidence quality, uncertainty preservation, time, and cost.

For frontier-model use, bind every result to the exact model, version,
configuration, prompt, tool access, repository revision, record version, and
case set. Test ID, subject, role, edge, applicability, abstention, and citation
accuracy separately. Include overlapping terms, paraphrases, reordered
material, missing context, contradictory evidence, irrelevant signals, and
unknown cases. NIST's AI RMF similarly connects evaluation to declared context,
representative conditions, documented measures, uncertainty, and continuing
assessment of the measurement process itself.[^nist-ai-rmf]

Do not use majority model agreement as ground truth. Predeclare acceptance
thresholds by the consequence of each error class, preserve harness errors and
unknowns, and rerun the same cases after a taxonomy, prompt, model, or tool
change.

## Research limits and lifecycle

The eight records are a design synthesis, not categories asserted verbatim by
one authority. The research compared product-quality, requirements,
architecture, measurement, assurance, V&V, configuration, secure-development,
supply-chain, observability, testing, and model-evaluation sources. No located
source establishes a natural number of cross-cutting concerns, a universal
breadth threshold, or a context-free relationship matrix.

The candidate rejects a flat list because product outcomes, supporting
artifacts, engineering-system capabilities, methods, and evidence have
different subjects and verdicts. It also rejects an immediately implemented
knowledge graph because the maintenance cost is unjustified before
classification and task trials. The hybrid is intended to be the smallest
structure that preserves subject, role, conditionality, and evidence limits.

Review the model when the product-pillar taxonomy changes, classification
trials show persistent overlap or gaps, a record loses independent
assessability, or a new concern passes the admission gate more cleanly than an
existing one. Merge, split, demote, or retire records based on observed use;
do not preserve eight as an editorial quota.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^iso-25030]: ISO, [ISO/IEC 25030:2019 quality requirements framework](https://www.iso.org/standard/72116.html).
[^iso-25040]: ISO, [ISO/IEC 25040:2024 quality evaluation framework](https://www.iso.org/standard/83467.html).
[^iso-25020]: ISO, [ISO/IEC 25020:2019 quality measurement framework](https://www.iso.org/standard/72117.html).
[^iso-15939]: ISO, [ISO/IEC/IEEE 15939:2017 measurement process](https://www.iso.org/standard/71197.html).
[^iso-42010]: ISO, [ISO/IEC/IEEE 42010:2022 architecture description](https://www.iso.org/standard/74393.html).
[^iso-15026-1]: ISO, [ISO/IEC/IEEE 15026-1:2019 assurance concepts and vocabulary](https://www.iso.org/standard/73567.html).
[^iso-15026-2]: ISO, [ISO/IEC/IEEE 15026-2:2022 assurance case](https://www.iso.org/standard/80625.html).
[^sacm]: OMG, [Structured Assurance Case Metamodel 2.3](https://www.omg.org/spec/SACM/2.3/About-SACM).
[^kiczales]: Kiczales and Mezini, [Aspect-Oriented Programming and Modular Reasoning](https://www.cs.ubc.ca/~gregor/papers/kiczales-icse05-aopmr.pdf).
[^parnas]: Parnas, [On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html).
[^atam]: Software Engineering Institute, [Architecture Tradeoff Analysis Method collection](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/).
[^dependability]: Avizienis, Laprie, Randell, and Landwehr, [Basic Concepts and Taxonomy of Dependable and Secure Computing](https://www.landwehr.org/2004-aviz-laprie-randell.pdf).
[^swebok]: IEEE Computer Society, [Guide to the Software Engineering Body of Knowledge, Version 4.0](https://ieeecs-media.computer.org/media/education/swebok/swebok-v4.pdf).
[^nist-ssdf]: NIST, [Secure Software Development Framework 1.1](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf).
[^slsa]: SLSA, [Verifying artifacts](https://slsa.dev/spec/v1.2/verifying-artifacts).
[^nasa-assurance]: NASA, [Software Assurance and Software Safety Standard](https://standards.nasa.gov/sites/default/files/standards/NASA/B/0/NASA-STD-87398RevB.pdf).
[^ieee-1012]: IEEE, [IEEE 1012-2024 Standard for System, Software, and Hardware Verification and Validation](https://standards.ieee.org/ieee/1012/7324/).
[^opentelemetry]: OpenTelemetry, [Signals](https://opentelemetry.io/docs/concepts/signals/).
[^google-sre]: Google, [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/).
[^test-desiderata]: Beck and Sutton, [Test Desiderata](https://testdesiderata.com/).
[^pstack]: Cursor, [pstack](https://github.com/cursor/plugins/tree/main/pstack).
[^nist-ai-rmf]: NIST, [AI Risk Management Framework core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/).
