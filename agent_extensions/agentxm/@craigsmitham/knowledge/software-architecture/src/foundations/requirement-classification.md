---
type: Explanation
title: Classifying requirements in software architecture
description: How to choose one primary profile requirement type from the obligation itself while using standards classifications as complementary lenses rather than competing authorities.
tags: [requirements-engineering, requirement-classification, functional, quality, process, human-factors, usability, constraints]
status: draft
sources:
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 — Requirements engineering
  - id: iso-25030
    resource: https://www.iso.org/standard/72116.html
    title: ISO/IEC 25030:2019 — Quality requirements framework
  - id: software-architecture-profile
    resource: ../architecture-documentation/software-architecture-application-profile.md#requirement-types
    title: Software architecture docs application profile — Requirement types
  - id: requirements-engineering
    resource: requirements-engineering.md
    title: Requirements engineering in software architecture
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:47:49Z
---

# Classifying requirements in software architecture

Requirement classification answers **what kind of obligation has been
accepted**. It does not determine whether the obligation is a requirement,
which sentence form to use, where evidence belongs, or how the system should
realize it.

The software-architecture-docs profile requires one primary type so a
Requirement has one predictable subject-colocated home. The six types are a
profile adaptation of useful standards distinctions, not a claim that every
standards taxonomy partitions the world in exactly the same way.[^iso-29148]

## Three questions that must stay separate

| Question | Answer owned by |
| --- | --- |
| Is this an accepted obligation? | The Requirement admission and acceptance process |
| What kind of obligation is it? | `requirement_type` |
| How will satisfaction be established? | Evidence and assurance authorities |

A structured clause such as “When …, the subject shall …” is a writing form.
It can express any of the six types. A source need, policy, scenario, risk, or
higher-level requirement is an input. It becomes a Requirement only after its
meaning, subject, feasibility, and authority are established. Neither the
clause form nor the input type supplies acceptance.

## The profile types

Choose the type that best communicates the primary obligation:

| Type | Primary question | Typical obligation |
| --- | --- | --- |
| `functional` | What behavior or result must the subject provide? | Respond, transform, calculate, preserve, reject, recover, or transition state |
| `quality` | How well, or to what assessable condition, must the obligated subject provide a system, product, service, use, or data outcome? | Availability, response-time distribution, confidentiality strength, modifiability, data accuracy |
| `process` | What durable outcome must an accepted lifecycle, development, operational, or governance process produce? | Review, approval, independent assessment, release control, retention, operational exercise |
| `human-factors` | What must account for human capabilities, limitations, workload, safety, health, or environment? | Workload limit, fatigue mitigation, safe allocation of control, accommodation of physical or cognitive limits |
| `usability` | What outcome must specified users achieve in a stated context of use? | Effectiveness, efficiency, satisfaction, learnability, or error recovery during interaction |
| `constraint` | What binding limit narrows the permitted solution or operating space? | Mandated technology, protocol, region, law, policy, platform, interface form, or prohibition |

The type is a navigation and review aid. The binding statement and its source
remain authoritative for the obligation's meaning.

## A practical decision sequence

1. Identify the subject, condition, required outcome, and accepted authority.
2. Ask whether the statement primarily limits the permitted solution or
   operating space. If so, choose `constraint`.
3. Ask whether it obligates a lifecycle, development, operational, or
   governance process rather than the delivered behavior or quality of the
   subject. If so, choose `process`.
4. Ask whether the primary outcome concerns human capabilities, limitations,
   workload, safety, health, or environment. If so, choose `human-factors`.
5. Ask whether specified users must achieve specified goals with an
   interaction outcome in a context of use. If so, choose `usability`.
6. Ask whether the obligation states an assessable degree or condition of
   system, product, service, or data quality. If so, choose `quality`.
7. Otherwise, when it requires behavior, information, transformation,
   response, state transition, or preservation, choose `functional`.

This order is a diagnostic aid, not a rule that later questions are less
important. When several lenses apply, choose the type that communicates the
primary accepted outcome and record other consequential dimensions in the
statement, rationale, sources, or linked requirements. Split the statement
when those dimensions can be accepted, changed, or evaluated independently.

## Recurring boundary cases

### Interface

“Interface requirement” is not a profile type because interface concerns can
carry different semantics:

- required interaction behavior or exchanged information is `functional`;
- an assessable interaction or interoperability outcome is `quality`;
- an outcome for specified users in a context of use is `usability`; and
- a mandated protocol, format, connector, or external interface technology is
  `constraint`.

Classify the obligation, not the noun *interface*.

### Performance

Performance is usually `quality` when it states how well behavior must be
delivered under a defined workload, population, percentile, window, or other
context. A timing rule that is itself part of domain behavior may be
`functional`; a fixed platform limit may be `constraint`. Preserve the reason
for the classification in the requirement's rationale when the distinction is
not obvious.

### Invariants and prohibitions

Invariant is a preservation semantic, not a seventh type. A required business
predicate preserved at an observation boundary is commonly `functional`; an
assessable preservation property may be `quality`; a binding prohibition that
narrows permissible realization may be `constraint`. Classify after asking
what the accepted predicate obligates.

### Security, safety, and accessibility

Concern names do not determine type. A required authorization decision is
functional; a resistance or protection level can be quality; a mandated
cryptographic mechanism can be constraint. A safety outcome can be quality or
human-factors depending on whether the primary obligation is a system quality
or a human-system condition. Accessibility can be usability, human-factors,
quality, or constraint depending on the accepted outcome and authority.

### Process versus product

“The release shall pass an independent review” obligates a governed process.
“The service shall reject an unsigned release artifact” obligates delivered
behavior. The first is `process`; the second is `functional`, even if both
respond to the same assurance concern.

ISO/IEC/IEEE 29148 often places project process requirements in acquisition or
statement-of-work information. This profile admits only the smaller subset
that is a durable, independently maintained obligation on development,
operation, lifecycle, or governance of the documented system. Transient tasks,
plans, and current workflow instructions remain with their operational or
delivery authorities.

## Relating the standards lenses

ISO/IEC/IEEE 29148 gives examples including functional and performance,
interface, process, quality, usability, and human-factors requirements, while
also discussing constraints. ISO/IEC 25030 specializes quality requirements
for quality in use, product quality, and data quality.[^iso-25030] The profile
adapts those lenses as follows:

| Standards lens | Profile treatment |
| --- | --- |
| Functional or performance | Functional behavior remains `functional`; assessable performance is normally `quality` |
| Interface | Classify by the interaction's behavior, quality, human use outcome, or binding limitation |
| Process | `process`, within the durable system-work boundary above |
| Quality or non-functional | `quality`; do not use “non-functional” as a residual bucket |
| Usability or quality in use | `usability` when the interaction outcome is primary; `quality` when a broader quality-model outcome is primary |
| Human factors or human-system integration | `human-factors` when human capabilities, limitations, workload, safety, health, or environment are primary |
| Constraint | `constraint` when the accepted meaning is a binding limitation |
| Product, system, service, or data quality | `quality`; state the actual quality-bearing subject and use model metadata only where the profile supports it |

Classification should expose ambiguity, not conceal it. If reviewers cannot
agree on a type because they understand the obligation differently, resolve
the meaning and acceptance boundary before choosing a folder.

For the common authoring procedure, see [Documenting
requirements](../guides/documenting-requirements.md). Then use the focused
guide for the selected type.

[^iso-29148]: ISO/IEC/IEEE 29148:2018 supplies requirements-engineering
    concepts and examples of requirement classifications adapted here; this
    profile does not claim that its enum reproduces the standard's information
    model.
[^iso-25030]: ISO/IEC 25030:2019 distinguishes quality-in-use, product-quality,
    and data-quality requirements within its quality-requirements framework.
