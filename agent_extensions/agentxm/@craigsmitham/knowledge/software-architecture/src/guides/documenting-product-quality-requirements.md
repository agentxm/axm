---
type: Guide
title: Documenting quality requirements
description: How to engineer and document one accepted, assessable system, product, service, or data quality obligation using the unified Requirement model and an applicable quality classification.
tags: [architecture-documentation, requirements, quality, iso-25010, iso-25030]
status: draft
sources:
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
  - id: product-quality
    resource: ../foundations/product-quality.md
    title: Quality requirements in software architecture
  - id: requirement-classification
    resource: ../foundations/requirement-classification.md
    title: Classifying requirements in software architecture
  - id: iso-25030
    resource: https://www.iso.org/standard/72116.html
    title: ISO/IEC 25030:2019 — Quality requirements framework
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:47:49Z
---

# Documenting quality requirements

Use this guide after a system, software product, service, or data quality
concern has an accepted authority and needs one assessable obligation on a
durable architecture subject. A quality-model classification helps readers
find and compare the requirement; it does not supply its need, target, or
evidence.[^product-quality]

## 1. Engineer the quality outcome

Follow [Documenting requirements](documenting-requirements.md) to establish the
source, subject, abstraction level, rationale, feasibility, and correctness.
Then make the quality-specific content explicit:[^documenting-requirements]

- relevant context, state, workload, actor, or operating condition;
- the quality outcome required of the subject;
- the accepted criterion, threshold, tolerance, or boundary when one is
  necessary to make the outcome assessable; and
- material exclusions or maintenance windows when they change the meaning.

Do not begin from an ISO/IEC 25010 category and invent a requirement to fill
it. Do not copy a familiar percentage, latency, severity, or rating from
another system without source authority and feasibility analysis.

This need-first, assessable-outcome progression adapts ISO/IEC
25030.[^iso-25030]

ISO/IEC 25030 distinguishes quality-in-use, product-quality, and data-quality
requirements.[^iso-25030] Distinguish the eligible architecture subject that
is obligated from the product, service, data, or use outcome whose quality is
being required, then select a model. Do not force a data-quality or
quality-in-use concern into product-quality metadata merely because that is
the profile's currently validated model.

## 2. Distinguish quality from neighboring types

Choose `quality` when the primary obligation is an assessable degree or
condition of system, product, service, or data quality.

- What the subject does is `functional`; how well it does it is usually
  `quality`.
- A mandated mechanism, protocol, region, or platform is `constraint`, even
  when it exists to protect quality.
- An outcome of use for specified users and goals is `usability` when that
  navigation best communicates the obligation.
- A workload, safety, capability, or limitation concern at the human-system
  boundary is `human-factors` when that is primary.
- A required review, approval, assessment, or operational exercise is
  `process`; the quality outcome it helps assure remains separate.

Performance is normally `quality` when a workload, population, distribution,
window, or tolerance qualifies how well behavior must be delivered. A timing
rule can instead be functional when it is part of the domain behavior itself.

## 3. Draft the statement

Use the ordinary profile form:

> When `[relevant quality context]`, `[subject]` shall `[assessable quality
> outcome]` `[within accepted bounds]`.

Prefer one quality factor per Requirement. A single outcome can have several
conditions or bounds when they qualify the same obligation. Split statements
when the outcomes can be accepted, changed, or evaluated independently.

A numerical target is not always required. A qualitative statement can be
valid when defined terms and observable consequences make it unambiguous and
verifiable. Conversely, a precise number is not sufficient when its workload,
population, observation window, percentile, exclusions, or other context is
undefined.

## 4. Classify after the obligation is known

Set:

```yaml
requirement_type: quality
quality_model: ISO/IEC 25010:2023
quality_characteristic: reliability
quality_subcharacteristic: availability
```

Use the exact characteristic and subcharacteristic names required by the
profile and ensure they accurately describe the accepted outcome. The metadata
classifies the Requirement; its path remains under the subject's
`requirements/quality/` collection.

The profile currently defines mechanically validated classification fields
for ISO/IEC 25010:2023 product quality. A quality Requirement outside that
model still needs an applicable accepted representation; do not misclassify it
to satisfy the example. Resolve the profile gap or use a profile-permitted
model only when its vocabulary and validation contract are available.

## 5. Separate desired state from evaluation

Include a measure or criterion in the Requirement when it is part of what must
be achieved. Keep the following with the evidence or assurance authority unless
they are themselves accepted constraints:

- verification or validation method;
- test, benchmark, inspection, or analysis procedure;
- tooling and environment provisioning;
- sample selection and execution schedule;
- current measurement or observed result; and
- volatile links to individual test files or dashboards.

Those authorities reference the stable `requirement_id` and can evolve without
silently changing desired state.

## 6. Review both kinds of quality

Review the Requirement against all nine individual characteristics in
[Documenting requirements](documenting-requirements.md#5-verify-the-individual-requirement).
Then ask:

- Does the statement identify the obligated subject and quality-bearing outcome rather
  than merely naming an “ility”?
- Is the context sufficient to interpret the criterion or target?
- Could appropriate evidence distinguish satisfaction from failure?
- Is the quality classification accurate but not carrying meaning that belongs
  in the statement?
- Are tradeoffs with other requirements and combined feasibility understood?

Review interacting quality requirements as a declared set when targets can
conflict or consume shared resources.

## Example

Vague:

> The reservation service shall be highly available.

Synthetic, assessable example:

> During declared booking hours, the reservation service shall accept or
> reject valid reservation requests during at least 99.9 percent of one-minute
> observation intervals in each calendar month, excluding declared maintenance
> windows.

The percentage, interval, calendar boundary, and exclusions are synthetic
example decisions, not portable defaults. A real Requirement needs source
authority, feasibility analysis, stakeholder validation, an eligible subject,
and an evidence authority that defines the exact evaluation procedure.

Do not create a top-level `quality/` taxonomy, a `Product Quality Requirement`
type, a verification-method field, or a copied test inventory. Colocate the
Requirement under its subject and let evidence reference its
`requirement_id`.

[^documenting-requirements]: Documenting requirements supplies the common
    engineering, statement, review, placement, and change procedure.
[^iso-25030]: ISO/IEC 25030:2019 supplies the quality-requirements framework
    adapted by this focused procedure.
[^product-quality]: Quality requirements in software architecture explains the
    distinction between quality concerns, accepted quality Requirements,
    classifications, architecture responses, and evidence.
