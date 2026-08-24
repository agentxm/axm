---
type: Explanation
title: Product quality in software architecture
description: How ISO/IEC 25010 product quality characteristics classify accepted, assessable requirements whose consequences matter to architecture without creating a quality catalog or duplicating stronger authorities.
tags:
  [
    product-quality,
    quality-requirements,
    iso-25010,
    square,
    architecture-significant-requirements,
    quality-scenarios,
    software-architecture,
  ]
status: draft
sources:
  - id: iso-25010
    resource: https://www.iso.org/standard/78176.html
    title: ISO/IEC 25010:2023 — Product quality model
  - id: iso-25030
    resource: https://www.iso.org/standard/72116.html
    title: ISO/IEC 25030:2019 — Quality requirements framework
  - id: sei-qaw
    resource: https://www.sei.cmu.edu/library/quality-attribute-workshops-qaws-third-edition/
    title: Software Engineering Institute — Quality Attribute Workshops
generated:
  by: codex/gpt-5.6
  at: 2026-08-21T23:53:22Z
---

# Product quality in software architecture

Product quality describes properties of an ICT or software product that can be
specified, measured, and evaluated. ISO/IEC 25010:2023 supplies a reference
model of nine characteristics and their subcharacteristics; ISO/IEC 25030:2019
uses quality models to categorize quality requirements derived from
stakeholder quality needs.[^iso-25010][^iso-25030]

Architecture documentation needs only a selective projection of that larger
requirements practice. Its first-class unit is a named **Product Quality
Requirement**: an accepted, assessable expectation for the quality of a target
system or constituent whose satisfaction materially constrains architecture.

## Keep the concepts concrete

| Concept                                       | Role                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Stakeholder quality need, risk, or obligation | Explains why an outcome matters; it may not yet be accepted or assessable.                                                         |
| Characteristic and subcharacteristic          | Classify the requirement using shared ISO/IEC 25010 vocabulary.                                                                    |
| Product Quality Requirement                   | States the accepted quality outcome for a named target under relevant conditions.                                                  |
| Architectural response                        | Explains the consequential responsibilities, boundaries, state, dependencies, invariants, deployment choices, or tradeoffs.        |
| Measure and evidence                          | Establish how satisfaction is assessed through an owning requirement, test, benchmark, objective, evaluation, or telemetry source. |

The useful progression is therefore:

> quality need, risk, or obligation → Product Quality Requirement →
> architectural response → evidence

The general architecture-description word _concern_ may still describe
something a stakeholder cares about. It is not a separate product-quality
concept, document type, or maturity stage. A vague concern becomes durable
architecture knowledge only after accepted meaning passes the admission test.

## Use the product quality model as classification

ISO/IEC 25010:2023 defines functional suitability, performance efficiency,
compatibility, interaction capability, reliability, security, maintainability,
flexibility, and safety.[^iso-25010] These characteristics and their
subcharacteristics are a reference vocabulary, not a checklist or set of
mandatory document headings.

This guidance deliberately covers the **product quality** model. Quality in
use, data quality, process quality, service management, and organizational
quality have different scopes and authorities. Link them when they justify or
assess a product quality requirement; do not pull them into the architecture
corpus merely to complete the SQuaRE family.

A requirement can apply to the whole system or to one constituent. Its target
relationship expresses that scope. Do not create parallel system-wide and
localized taxonomies. When one requirement maps to several
subcharacteristics, give it one canonical primary classification and link the
additional classifications instead of copying the document.

## Admit only architecture-significant requirements

A Product Quality Requirement belongs in architecture documentation only when
it is:

- accepted desired state rather than an unresolved option;
- consequential to the architecture;
- durable through ordinary implementation change;
- difficult to infer reliably enough from authoritative repository, generated,
  or live sources;
- sufficiently clear to assess; and
- worth its reading, review, reconciliation, and drift cost.

It is architecture-significant when satisfying it materially constrains one or
more of:

- responsibility, authority, state ownership, or lifecycle;
- boundaries, dependencies, or permitted interactions;
- consistency, trust, failure, or recovery models;
- technology, deployment, scaling, or observability structure;
- the system's ability to change; or
- a consequential tradeoff among these choices.

A local validation rule or current timeout may be important without needing a
durable architectural explanation. Conversely, an accepted qualitative
requirement can be architecture-significant before a numerical target exists
when its conditions, required response, assessment criterion, and structural
consequences are clear. Do not invent a number to make it appear measurable.
If the outcome or acceptance remains undecided, keep it as a need, risk,
proposal, or requirements gap rather than architecture truth.

## State the requirement and its consequences

A useful requirement makes these relationships easy to find:

- **Target:** the system, container, component, capability, feature, use case,
  or other constituent whose quality is constrained;
- **Classification:** the primary ISO/IEC 25010 characteristic and
  subcharacteristic, plus any consequential secondary classifications;
- **Outcome and conditions:** what must hold, when, and in which relevant
  environment or event;
- **Justification:** the accepted need, risk, obligation, or use case that
  makes the outcome important;
- **Architecture significance:** why the requirement belongs in architecture
  documentation and which choices it constrains;
- **Assessment:** the criterion or authoritative measure and evidence route;
  and
- **Tradeoffs:** only the tensions or accepted compromises that affect change.

Quality-attribute scenarios can expose these relationships when a broad label
permits competing interpretations. The Software Engineering Institute's
Quality Attribute Workshop elicits and prioritizes scenarios around a stimulus,
environment, affected artifact, response, and response measure.[^sei-qaw] Use
that structure as a reasoning aid, not as mandatory six-field bureaucracy.

For example, _reliability_ alone supplies no decision guidance. “After a worker
stops during an accepted import, a replacement resumes from the last durable
checkpoint without accepting a record twice” identifies a target, event,
response, and architectural implications for state ownership and recovery.

## Keep precision with its authority

Architecture prose should own the durable required outcome and architectural
consequences only when it is the appropriate authority. Other sources retain
their strengths:

| Authority                        | What it should own                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Requirement or policy system     | Contractual, regulatory, or otherwise externally governed requirement text                        |
| Tests and executable examples    | Exact exercised scenarios and regression evidence                                                 |
| Service-objective configuration  | Current numerical objectives and alert thresholds                                                 |
| Code, schemas, and configuration | Current implementation, contracts, and wiring                                                     |
| Telemetry and evaluation results | Observed or measured quality at a point in time                                                   |
| Architecture documentation       | Durable architectural interpretation, constraints, and tradeoffs not reliably inferable elsewhere |

When another source already owns the requirement, do not create a shadow
Product Quality Requirement. Link the authority from the affected architecture
concept and state only the architectural consequence that the source does not
explain. When architecture documentation does own the requirement, link its
assessment evidence instead of copying volatile values or results. State what
each link establishes and do not claim more evidence than it provides.

The result is not a quality catalog, a mandatory product-quality view, or a
second requirements system. It is the smallest set of named,
architecture-significant Product Quality Requirements needed to understand and
change the system safely.

For the authoring procedure, see [Documenting product quality
requirements](../guides/documenting-product-quality-requirements.md).

[^iso-25010]:
    ISO/IEC 25010:2023 defines a product quality model with nine
    characteristics and their subcharacteristics as a reference for specifying,
    measuring, and evaluating ICT and software product quality.

[^iso-25030]:
    ISO/IEC 25030:2019 defines a framework for eliciting stakeholder
    quality needs and defining, analyzing, using, and governing quality
    requirements categorized by applicable quality models.

[^sei-qaw]:
    The SEI describes the Quality Attribute Workshop as a method for
    identifying, refining, and prioritizing stakeholder scenarios that reveal
    architecture-driving quality attributes.
