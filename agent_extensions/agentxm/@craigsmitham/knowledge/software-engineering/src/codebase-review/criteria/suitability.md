---
type: Checklist
title: Suitability quality criteria
description: Use when assessing whether the product's capability set is complete and appropriate for its intended stakeholder needs and operating context.
tags: [codebase-review, software-quality, suitability, functional-fitness, stakeholders, reporting-review]
status: draft
sources:
- id: iso-25010
  resource: https://www.iso.org/standard/78176.html
  title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
- id: iso-25030
  resource: https://www.iso.org/standard/72116.html
  title: ISO/IEC 25030:2019 Systems and software Quality Requirements and Evaluation — Quality requirements framework
- id: ieee-1012
  resource: https://standards.ieee.org/ieee/1012/7324/
  title: IEEE 1012-2024 Standard for System, Software, and Hardware Verification and Validation
- id: iso-42010
  resource: https://www.iso.org/standard/74393.html
  title: ISO/IEC/IEEE 42010:2022 Architecture description
- id: hoare
  resource: https://sites.cs.ucsb.edu/~kemm/courses/cs266/acmhoare69.pdf
  title: An Axiomatic Basis for Computer Programming
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Suitability quality criteria

Use this list to judge whether the product provides a complete and appropriate
capability set for accepted stakeholder needs, goals, scenarios, and context.
A product can conform perfectly to its specification while the specification
or capability set fails the intended purpose; verification and validation must
therefore remain distinguishable.[^hoare][^ieee-1012]

This is a candidate `reporting-review` checklist. Repository evidence alone
will often be insufficient because suitability depends on stakeholder and use
evidence. Apply the shared assessment states and evidence rules in
[Reviewing a codebase](../reviewing-a-codebase.md). The pillar definition and
neighbor boundaries are in [Software quality
pillars](../software-quality-pillars.md); the typed relationships below use
[Cross-cutting concerns for software quality](../cross-cutting-concerns.md).

## Default cross-cutting relationships

`XC-01` Claim context constrains every criterion through accepted stakeholders,
goals, uses, environments, allocations, and exclusions. `XC-08` Evidence must
qualify every judgment. Unless a criterion says otherwise, these list-level
defaults apply:

| Concern | Default relationship to Suitability |
| --- | --- |
| `XC-02` Specification | `EN·EV` — records accepted needs and their relation to product capabilities. |
| `XC-03` Structure | `(CTR·TR)` — allocation and boundaries can help or impair capability fit. |
| `XC-04` Lifecycle integrity | `(EN·TH)` — product versions and configuration can enable or remove required capability. |
| `XC-05` Risk | `TH·CS·TR` — consequence, variation, and tradeoffs condition which capabilities are appropriate. |
| `XC-06` Assurance | `EN·EV` — validation activities can support fitness claims. |
| `XC-07` Feedback | `EV` — observed use and stakeholder feedback can reveal unmet or unnecessary capability. |

## Criteria

`SUI-01` is the aggregate completeness judgment. `SUI-03` through `SUI-09`
provide specific lenses on why coverage can be incomplete or inappropriate.
Assess the specific lens, roll its consequence into `SUI-01`, and create one
canonical finding rather than duplicating the same missing capability. If an
accepted product contract already promises the capability, information, mode,
scenario, stakeholder, or variation, implementation nonconformance belongs to
Correctness; Suitability owns an accepted need that the governing contract
omits or misframes.

### SUI-01 — Need coverage

**Outcome question:** Does the product provide a capability for
every accepted in-scope stakeholder need?[^iso-25010][^iso-25030]

**Why it matters:** a correctly implemented product can still be incomplete.

**Applicability:** judge only accepted needs within the claim context. Missing
or ambiguous need evidence normally makes the product verdict
`Indeterminate`, while the specification may receive a separate finding.

**Boundary:** this criterion owns missing capability. Correctness owns whether
supplied behavior conforms to its accepted contract.

### SUI-02 — Goal fitness

**Outcome question:** For each accepted goal, is the product's supplied
capability appropriate to accomplishing that goal in context?[^iso-25010][^ieee-1012]

**Why it matters:** functional availability is insufficient when the
capability does not help accomplish the intended purpose.

**Applicability:** apply to accepted goals and material capabilities; evidence
of use is stronger than a label or asserted feature purpose.

**Boundary:** this criterion starts from an accepted goal and owns the
appropriateness of supplied capability for it. `SUI-10` starts from a material
capability and asks whether it has a justified purpose; Correctness owns
implementation conformance, and Usability owns user effort and interaction.

### SUI-03 — Workflow closure

**Outcome question:** Does the allocated capability set enable
each in-scope end-to-end outcome without an undeclared external
workaround?[^iso-25030][^iso-42010]

**Why it matters:** isolated functions may exist while the intended outcome
remains unattainable.

**Applicability:** apply where the product owns or coordinates a material
portion of a workflow. Declared external participants do not constitute a
workaround.

**Boundary:** this criterion owns completeness of the product's allocated
workflow role. Compatibility owns successful exchange with declared external
participants; a broken implemented step belongs to Correctness or Reliability.

### SUI-04 — Scenario coverage

**Outcome question:** Does the capability set address every
materially distinct intended-use scenario in scope?[^iso-25030][^ieee-1012]

**Why it matters:** completeness is meaningful only against concrete
conditions of use rather than an unqualified nominal case.

**Applicability:** claim context supplies intended scenarios. Missing scenario
evidence is uncertainty, not automatic product failure.

**Boundary:** this criterion owns capability coverage of intended use.
`XC-05` Risk owns off-nominal threats and tradeoffs; Reliability owns service
continuity within a covered scenario.

### SUI-05 — Stakeholder coverage

**Outcome question:** Does the capability set address the
accepted needs of every in-scope stakeholder class?[^iso-25030][^iso-42010]

**Why it matters:** a product can satisfy its dominant user while omitting
another user, operator, integrator, maintainer, or affected party whose need
is material.

**Applicability:** apply only to identified in-scope stakeholders and accepted
needs. Conflicting needs require an explicit decision rather than an
assumption that all can be maximized.

**Boundary:** Claim context identifies the stakeholders and Specification
records accepted needs; this criterion owns product coverage of those needs.

### SUI-06 — Mode coverage

**Outcome question:** Does the product provide the appropriate
capability in every required operating mode?[^iso-25010][^iso-25030]

**Why it matters:** a capability available only in a favored mode may leave
an accepted need unmet during administration, maintenance, offline use,
degradation, or another required condition.

**Applicability:** apply only to declared modes and their allocated
capabilities. Do not invent modes to fill the criterion.

**Boundary:** this criterion owns capability availability by mode.
Correctness owns legal mode transitions; Reliability owns continuity while
modes change or degrade.

### SUI-07 — Information sufficiency

**Outcome question:** Do product outcomes contain the
domain information required for their intended downstream decision or
action?[^iso-25030][^hoare]

**Why it matters:** an accurate result can still be unfit for purpose when it
omits information the intended outcome requires.

**Applicability:** apply to product outcomes used by a person or system to
decide or act. The required content must have stakeholder or domain authority.

**Boundary:** this criterion owns an information need omitted or misframed by
the accepted capability set. If the accepted product contract already promises
the information, nonconformance belongs to Correctness; Usability owns its
presentation and Compatibility its meaning across an external relationship.

### SUI-08 — Responsibility fit

**Outcome question:** Does the responsibility allocated to
the product fit its intended role in the enclosing system or
workflow?[^iso-42010][^iso-25030]

**Why it matters:** missing, duplicated, or misplaced responsibility can make
an otherwise functioning product unsuitable in its larger context.

**Applicability:** apply when the product is one participant in a broader
system, organization, or workflow with accepted responsibility allocations.

**Boundary:** this criterion owns external allocation fit. `XC-03` Structure
owns internal responsibility boundaries; Compatibility owns interaction
across the allocated interfaces.

### SUI-09 — Variation coverage

**Outcome question:** Does the product cover every accepted
present variation of an intended need within scope?[^iso-25010][^iso-25030]

**Why it matters:** nominal support can conceal missing capability for
legitimate populations, configurations, jurisdictions, or domain variants.

**Applicability:** apply only to accepted current variation, not invalid input
or an imagined future environment.

**Boundary:** this criterion owns an accepted present variation omitted or
misframed by the capability set. If the accepted product contract already
promises the variation, nonconformance belongs to Correctness; Evolvability
owns the ability to adapt to a future variation.

### SUI-10 — Capability relevance

**Outcome question:** Does every material product capability
have a justified in-scope purpose?[^iso-25010][^hoare]

**Why it matters:** unnecessary capability can obstruct goals and introduce
cost, exposure, or cognitive burden without contributing intended value.

**Applicability:** this is not a demand to delete every unused code path,
optional extension point, or latent administrative function. Judge accepted
purpose and material consequence.

**Boundary:** this criterion starts from a material capability and owns whether
it has a justified purpose. `SUI-02` starts from an accepted goal and asks
whether supplied capability is appropriate to it. Intelligibility owns
comprehension burden, Evolvability change burden, and Risk the adverse
consequences of retaining it.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
The ten criteria are context-sensitive lenses on completeness and
appropriateness, not independent weighted factors or a claim that all
suitability can be established from a repository.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^iso-25030]: ISO, [ISO/IEC 25030:2019 quality requirements framework](https://www.iso.org/standard/72116.html).
[^ieee-1012]: IEEE, [IEEE 1012-2024 Verification and Validation](https://standards.ieee.org/ieee/1012/7324/).
[^iso-42010]: ISO, [ISO/IEC/IEEE 42010:2022 architecture description](https://www.iso.org/standard/74393.html).
[^hoare]: Hoare, [An Axiomatic Basis for Computer Programming](https://sites.cs.ucsb.edu/~kemm/courses/cs266/acmhoare69.pdf).
