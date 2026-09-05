---
type: Guide
title: Reviewing a codebase
description: Use when a repository needs a bounded quality review; frame product claims, assess applicable pillar criteria, apply relevant cross-cutting concerns, and preserve evidence and uncertainty without treating checklist completion as assurance.
tags: [codebase-review, software-quality, evidence, assessment, reporting-review, checklist]
status: draft
sources:
  - id: iso-evaluation
    resource: https://www.iso.org/standard/83467.html
    title: ISO/IEC 25040:2024 Quality evaluation framework
  - id: assurance-case
    resource: https://www.iso.org/standard/80625.html
    title: ISO/IEC/IEEE 15026-2:2022 Assurance case
  - id: nist-ssdf
    resource: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf
    title: Secure Software Development Framework
  - id: inspections
    resource: https://publica.fraunhofer.de/entities/publication/eb2a71d4-2bfc-43c8-a5bf-8a03f643c016
    title: Perspective-based versus checklist-based software inspection
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Reviewing a codebase

Use this guide to assess a bounded software product through the ten
[product-quality criteria lists](criteria/). The primary interaction mode is
`reporting-review`: the lists support coverage and traceability, while the
reviewer or model selects context-appropriate ways to investigate each
outcome. Each item receives a multi-state assessment; recording one does not
prove the judgment or certify the product.[^inspections]

**Collection status:** candidate. The criteria are source-reviewed and
design-reviewed, not field-validated controls. They do not establish release,
security, safety, compliance, or fitness decisions on their own.

## Frame the claims once

Before selecting criteria, create one `XC-01` Claim context record for the
review:

| Field | Required framing |
| --- | --- |
| Target | Product or system, repository revision or release, paths, artifacts, and interfaces in scope |
| Purpose | The question being answered and decisions the review may inform |
| Stakeholders | Intended users, operators, maintainers, integrators, affected people, and decision owners that matter to the claims |
| Use and environment | Intended uses, workloads, deployments, dependencies, lifecycle stage, and material operating conditions |
| Consequence | Criticality, risk tolerance, required confidence, and specialist or independent review obligations |
| Evidence access | Whether execution, CI, history, telemetry, external configuration, stakeholder evidence, and production evidence are available |
| Limits | Exclusions, accepted exceptions, assumptions, unavailable evidence, time boundary, and neighboring assessments |

Repository evidence can directly expose some internal properties and can
support other claims, but it cannot establish every runtime, stakeholder, or
quality-in-use outcome. Quality evaluation therefore begins with a declared
target and scope rather than an unqualified claim about “the codebase.”[^iso-evaluation]

## Select the product-quality lists

Consider all ten lists, then select each applicable list or record why it is
outside the review boundary:

- [Suitability quality criteria](criteria/suitability.md)
- [Correctness quality criteria](criteria/correctness.md)
- [Reliability quality criteria](criteria/reliability.md)
- [Security quality criteria](criteria/security.md)
- [Safety quality criteria](criteria/safety.md)
- [Efficiency quality criteria](criteria/efficiency.md)
- [Usability quality criteria](criteria/usability.md)
- [Compatibility quality criteria](criteria/compatibility.md)
- [Evolvability quality criteria](criteria/evolvability.md)
- [Intelligibility quality criteria](criteria/intelligibility.md)

The ten lists own product-quality judgments. Do not substitute a verdict about
tests, documentation, modularity, telemetry, build configuration, or another
supporting subject for the relevant product verdict.

## Apply cross-cutting concerns without creating extra pillars

Use [Cross-cutting concerns for software quality](cross-cutting-concerns.md) to
interpret relationships that matter to a selected pillar:

| Record | Use in a review |
| --- | --- |
| `XC-01` Claim context | Frame every claim and its applicability before assessment. |
| `XC-02` Specification | Relate accepted needs, requirements, contracts, invariants, and bounds to the product outcome. |
| `XC-03` Structure | Explain conditional contributions or tradeoffs created by boundaries, dependencies, authority, state, and complexity. |
| `XC-04` Lifecycle integrity | Relate configuration, versions, dependencies, construction, provenance, migrations, releases, and recovery to the outcome. |
| `XC-05` Risk | Relate faults, threats, hazards, misuse, sensitivity, consequence, and tradeoffs to the outcome. |
| `XC-06` Assurance | Identify the portfolio of activities that produced possible grounds for the claim. |
| `XC-07` Feedback | Relate runtime, user, incident, and change feedback to the outcome. |
| `XC-08` Evidence | Judge whether the grounds are fit for the exact claim and decision. |

Claim context and Evidence are universal envelopes. Consider the other six
for applicability; do not force a relationship or repeat the default pillar
matrix on every criterion. Record a criterion-specific relationship only when
it changes interpretation, evidence, or a finding.

## Assess every selected criterion

For each criterion:

1. determine whether it applies within the shared claim context;
2. choose an inspection approach suited to the repository, consequence, and
   evidence access, using an optional [review aid](review-aids/) when useful;
3. record observations, declarations, conflicting evidence, unavailable
   evidence, and material counterevidence;
4. distinguish the desired product state from principles, mechanisms,
   metrics, heuristics, and supporting-artifact qualities;
5. assign exactly one assessment state and explain the evidence-to-claim
   relationship; and
6. link a supported finding, bounded exception, or reason that no finding is
   warranted.

Use these states:

| State | Meaning |
| --- | --- |
| `Meets` | Sufficient evidence supports the criterion throughout the declared scope. |
| `Partially meets` | Evidence is mixed or the criterion holds only for a material subset of the scope. |
| `Does not meet` | Evidence demonstrates a material contrary condition or gap. |
| `Not applicable` | The criterion is outside the declared context; record the reason. |
| `Indeterminate` | Available evidence is insufficient, inaccessible, materially conflicting, or unfit to support a judgment. |
| `Not assessed` | The bounded review ended before the criterion was investigated. |

Never infer `Meets` from a missing finding, a green check, file presence, a
metric threshold, a scanner result, reviewer consensus, or checklist
completion. Assurance cases make claims, assumptions, arguments, and evidence
separate objects for this reason.[^assurance-case]

## Preserve an assessment record

Use this record for each selected item:

```text
Criterion: <stable criterion ID>
State: <one assessment state>
Scope: <portion of the shared claim context that this judgment covers>
Evidence: <snapshot-bound observations and sources>
Rationale: <why the evidence supports this state>
Limitations: <uncertainty, missing evidence, assumptions, and counterevidence>
Relationships: <material XC IDs and typed relationships, if criterion-specific>
Findings: <linked finding IDs or “none supported”>
Method identity: <only when needed to reproduce or qualify the evidence>
```

Keep `Indeterminate`, `Not assessed`, and `Not applicable` distinct. Missing
evidence is neither a pass nor automatically a product defect.

## Use optional supporting assessments and aids

Use a [supporting checklist](supporting/) only when its own artifact or
engineering system is in scope and can receive a separate verdict. For
example, [Test-suite quality criteria](supporting/test-suite-quality.md)
assesses tests as supporting artifacts; it cannot replace any product-quality
assessment.

The [review aids](review-aids/) provide optional approaches for locating and
challenging evidence. They are neither mandatory traversal sequences nor
exhaustive methods. Risk and context still determine which practices apply;
portable guidance must not become rote compliance.[^nist-ssdf]

## Admit and route findings

Open a finding only when it is:

- **Located:** bound to the affected artifact, relationship, behavior, or
  execution path at the reviewed snapshot;
- **Consequential:** names a credible defect, risk, cost, delay, harm, or lost
  capability rather than a preference;
- **Supported:** rests on more than a proxy, keyword, file presence, tool
  warning, or absence of contrary evidence;
- **Owned:** has one primary pillar or separately assessed supporting subject,
  with cross-references for other consequences;
- **Actionable:** identifies the condition that should change without
  prescribing an unsupported redesign; and
- **Calibrated:** states uncertainty, assumptions, missing evidence, and
  plausible counterevidence.

Use this shape:

> **Finding** — concise adverse condition
> **Owner** — primary pillar criterion or supporting criterion
> **Evidence** — snapshot-bound artifacts and observations
> **Consequence** — affected behavior, people, system, or maintenance work
> **Scope and uncertainty** — applicability, assumptions, counterevidence, and unknowns
> **Cross-cutting relationships** — relevant typed links
> **Direction** — the outcome remediation should establish

Keep one canonical finding when an underlying condition affects several
pillars. Cross-reference the other consequences instead of duplicating it.
Rank findings by consequence, exposure or frequency, breadth, evidence
strength, and remediation leverage. Report up to ten material findings per
selected list; never manufacture findings to fill a quota.

## Finish or resume safely

A review is reporting-complete when:

- the shared claim context is recorded;
- every pillar list is selected or excluded with a reason;
- every selected criterion has exactly one state and an assessment record;
- unsupported claims, missing evidence, and unfinished work remain visible;
- findings have canonical owners and cross-references; and
- the report states that completion is not certification or exhaustive
  assurance.

If interrupted, record the last completed criterion, the current evidence
boundary, unfinished lists, and any external state that may change before
resumption. Resume against the same revision or explicitly create a new claim
context.

Route changes to criteria, cross-cutting records, supporting checklists, or
aids through [Maintaining codebase-review
criteria](maintaining-codebase-review-criteria.md).

[^iso-evaluation]: ISO, [ISO/IEC 25040:2024 quality evaluation framework](https://www.iso.org/standard/83467.html).
[^assurance-case]: ISO, [ISO/IEC/IEEE 15026-2:2022 assurance case](https://www.iso.org/standard/80625.html).
[^nist-ssdf]: NIST, [Secure Software Development Framework](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf).
[^inspections]: Laitenberger et al., [Perspective-based versus checklist-based software inspection](https://publica.fraunhofer.de/entities/publication/eb2a71d4-2bfc-43c8-a5bf-8a03f643c016).
