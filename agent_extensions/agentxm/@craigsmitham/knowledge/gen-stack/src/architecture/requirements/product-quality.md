---
type: Explanation
title: Quality requirements in software architecture
description: How accepted system, product, service, and data quality outcomes become assessable, subject-centered Requirements that applicable quality models classify without generating obligations or owning evidence.
tags: [product-quality, data-quality, quality-in-use, quality-requirements, iso-25010, iso-25030, requirements-engineering, software-architecture]
status: draft
sources:
  - id: iso-25010
    resource: https://www.iso.org/standard/78176.html
    title: ISO/IEC 25010:2023 — Product quality model
  - id: iso-25030
    resource: https://www.iso.org/standard/72116.html
    title: ISO/IEC 25030:2019 — Quality requirements framework
  - id: requirements-engineering
    resource: requirements-engineering.md
    title: Requirements engineering in software architecture
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:12:18Z
---

# Quality requirements in software architecture

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

System, software-product, service, data, and quality-in-use outcomes can be the
concern of an accepted quality Requirement. The Requirement still obligates
one eligible architecture subject. A quality model supplies vocabulary for
classifying the required outcome; it does not create the obligation, identify
its subject, choose its target, or prove that a realization satisfies
it.[^iso-25010]

Do not confuse a **quality Requirement** with the **quality of a Requirement**.
Every Requirement, including a quality one, should be necessary, appropriate,
unambiguous, complete, singular, feasible, verifiable, correct, and conforming.
A quality Requirement additionally states an assessable degree or condition of
system, product, service, data, or use quality.[^requirements-engineering]

The useful flow is:

> stakeholder quality need, context of use, risk, policy, or higher-level
> obligation → analyzed and accepted quality Requirement → architecture
> response → evaluation evidence

Each stage has its own authority. The Requirement owns desired state. The
architecture explains consequential boundaries, responsibilities, state,
dependencies, or tradeoffs. Tests, benchmarks, telemetry, and assessments own
current evidence.

## Choose the quality-bearing subject

ISO/IEC 25030 distinguishes three related quality-requirement perspectives:

| Perspective | Quality-bearing object or outcome |
| --- | --- |
| Quality in use | Outcomes experienced when specified users pursue goals in a context of use |
| Product quality | Characteristics of a system or software product that affect its behavior and suitability |
| Data quality | Characteristics of data for stated needs and conditions |

The perspectives can interact but should not be collapsed. A product-quality
requirement about interaction capability does not automatically state whether
a particular user achieves a goal in context. A data-quality requirement does
not become product quality merely because software stores the data. Name the
obligated architecture subject, quality-bearing object, and accepted outcome
first.[^iso-25030]

This profile gives `usability` separate primary navigation for human outcomes
of use. Use that type when it communicates the obligation better, while
preserving the same need-first and evidence-separated discipline.

## From quality concern to requirement

Words such as *reliable*, *secure*, *usable*, or *maintainable* can identify a
concern without yet establishing an obligation. Engineering the concern
requires determining:

- the subject whose quality matters;
- the stakeholder need, risk, policy, or other authority;
- the relevant context, state, workload, actors, or conditions;
- the assessable quality outcome and any accepted criterion, threshold,
  tolerance, or boundary; and
- the tradeoffs and feasibility of requiring that outcome.

ISO/IEC 25030 provides the quality-requirements framework behind this
progression from quality need to defined and governed quality
requirement.[^iso-25030]

The quality model helps name the kind of outcome after this analysis. It must
not be used as a checklist that generates one requirement per characteristic
or subcharacteristic.

## When quality belongs here

Maintain a quality Requirement when it is accepted, assessable, and worth
understanding relative to a durable architecture subject. The obligation may
be qualitative before it has a numerical target when its conditions and
required response are still unambiguous and verifiable. Do not infer desired
state from an implementation, passing test, observed metric, taxonomy entry,
or generic industry target.

Use `requirement_type: quality`, keep the Requirement beside its subject, and
pin the applied quality model in metadata. ISO/IEC 25010:2023 product quality
is the profile's mechanically constrained model. Authors need lawful access to
its exact taxonomy. Do not label a data-quality or quality-in-use obligation
as product quality merely to reuse that taxonomy.

## Classification is not organization

Organizing every quality requirement under a top-level taxonomy makes the
classification easy to browse but separates the obligation from the thing it
qualifies. Subject colocation keeps a reader's primary question intact: “What
must this command, feature, capability, context, or component do or be?”

Generated views may group requirements by quality characteristic, risk,
evidence status, or any other useful lens. Those projections should resolve
stable `requirement_id` values rather than become parallel authorities.

## Quality and usability

Usability may be modeled within a quality model and intersects human factors.
This profile nevertheless provides `usability` as a primary requirement type
because product-surface readers frequently need that navigation directly.
Choose the type that best communicates the accepted obligation and use quality
metadata only when a quality-model classification materially helps.

## Keep evidence strategy separate

A quality requirement must be verifiable, but the Requirement need not
prescribe a verification method. The evidence strategy can evolve without
changing desired state. Let tests, evaluations, measures, telemetry, or
assurance plans reference `requirement_id`; generate reverse trace views when
readers need them.

The measure and acceptance criterion may belong in the Requirement when they
are part of desired state. The procedure, tool, sample design, environment
provisioning, and current result normally belong to the evaluation authority.

For the focused procedure, see [Documenting quality
requirements](/architecture/requirements/documenting-product-quality-requirements.md).

[^iso-25010]: ISO/IEC 25010:2023 supplies the product-quality model used for
    classification when that model is selected.
[^iso-25030]: ISO/IEC 25030:2019 supplies the framework for eliciting,
    defining, using, and governing quality requirements.
[^requirements-engineering]: Requirements engineering in software architecture
    defines the individual requirement-quality characteristics and the
    authority boundaries applied here.
