---
type: Explanation
title: Requirements engineering in software architecture
description: How needs become accepted, subject-centered requirements that guide architecture and realization, and how statement quality, set quality, validation, verification, traceability, and evidence remain distinct.
tags: [requirements-engineering, requirements, traceability, architecture, verification, validation]
status: draft
sources:
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 — Requirements engineering
  - id: incose-writing-requirements
    resource: https://www.incose.org/docs/default-source/working-groups/requirements-wg/gtwr/incose_rwg_gtwr_v4_040423_final_drafts.pdf
    title: INCOSE Guide to Writing Requirements, version 4
  - id: software-architecture-profile
    resource: ../architecture-documentation/software-architecture-application-profile.md#requirement
    title: Software architecture docs application profile — Requirement
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:19:59Z
---

# Requirements engineering in software architecture

Requirements engineering is not primarily sentence polishing. It transforms
stakeholder needs, policies, risks, use cases, and higher-level obligations
into an agreed set of requirements that can guide architecture and realization
and support later evaluation. Writing quality matters, but a clear sentence
can still express the wrong obligation or an infeasible target.[^incose-writing-requirements]

This architecture profile addresses one bounded part of that work: preserving
accepted, architecture-significant requirements beside the durable subjects
they obligate. It is not a request-intake process, a complete requirements
management system, or a claim that every behavior of the system has been
specified.[^software-architecture-profile]

## From source concern to maintained evidence

Requirements work is iterative rather than a one-way document pipeline:

```text
need, policy, risk, use case, or higher-level obligation
                              │
                 elicit, analyze, model, negotiate
                              ▼
                    candidate requirement
                              │
             verify the statement and validate its meaning
                              ▼
                     accepted requirement
                              │
           architecture response and system realization
                              ▼
                    evaluation evidence
                              │
           learning, impact analysis, and controlled change
                              └───────────────↺
```

The activities overlap. Architecture can expose missing, conflicting, or
infeasible requirements. Prototypes and evaluations can reveal that a stated
need was misunderstood. A changed requirement can require renewed agreement,
architecture analysis, and evidence; it should not be treated as a local prose
edit.

## Needs, requirements, and acceptance

A source request or stakeholder concern is useful evidence, but it is not
automatically a requirement. Analysis must establish the affected context,
desired outcome, constraints, conflicts, feasibility, and authority. A
requirement becomes part of this corpus only when the obligation and its
subject are accepted.

Acceptance does not mean that the implementation already satisfies the
requirement. It means the requirement is authoritative desired state for the
documented system. Delivery plans, implementation status, and current evidence
remain with the authorities that manage them.

## Architecture gives requirements subjects

Architecture and requirements answer different questions about the same
system. Architecture identifies durable subjects, boundaries,
responsibilities, and relationships. Requirements state what those subjects
shall do or be, under which relevant conditions and bounds. Implementations
realize both; evaluations provide evidence about satisfaction.

This ordering makes obligations readable relative to the system. A CLI
command, capability, bounded context, or component can own a coherent group of
requirements without making a test runner's unit, integration, or end-to-end
hierarchy the primary reader model.

The subject also fixes the level of abstraction. A system-level requirement
should not prescribe a lower-level design unless that choice is itself an
accepted constraint. Architecture and requirements may be elaborated
recursively: a system obligation can lead to derived obligations on its
elements as design decisions establish their responsibilities.

## Recognize obligations without collapsing architecture

Use independent acceptance and satisfaction as the boundary. A claim belongs
in a Requirement when it:

1. obligates the documented System or another eligible architecture subject;
2. states a necessary behavior, preserved condition, prohibition, quality,
   process outcome, or binding limitation; and
3. can be accepted, changed, retired, or evaluated independently of the
   architecture prose around it.

The vocabulary used for a claim does not create another semantic owner:

| Claim form | Canonical treatment |
| --- | --- |
| Invariant or guarantee | A Requirement when it is accepted desired state; a proof or implementation artifact when it exists only to establish or enforce another claim |
| Responsibility | Architecture records which subject owns an outcome, policy, decision, state, or authority; Requirements record what that subject is obliged to do or preserve |
| Boundary or dependency direction | Architecture describes the relationship; a binding prohibition or limitation is a constraint Requirement |
| Use-case step or extension | A source scenario; an independently accepted outcome becomes a linked Requirement |
| Architecture decision | The record owns the accepted choice and rationale; an independently binding limitation produced by the choice becomes a constraint Requirement sourced by the decision |
| Test, schema, check, or telemetry rule | Implementation, enforcement, or satisfaction evidence unless an accepted obligation is separately admitted |

Not every sentence that influences change is a Requirement. “The Billing
context owns posted-invoice state” assigns architecture authority. “At every
commit, the Billing context shall preserve the posted-invoice total” states an
obligation. Architecture may explain the authority and preservation response,
but the Requirement remains the sole normative formulation.

The profile's conformance rules and its required corpus-governance policies
govern the documentation itself; they are not Requirements of the documented
System. When lifecycle, decision, ownership, or assurance context introduces
an independently maintained obligation on system development, operation, or
governance, represent that obligation as a `process` Requirement and link it
from the kernel concept.

Reserve `shall` for binding Requirement statements in a conforming corpus.
Words such as *must*, *guarantee*, *preserve*, *prohibit*, *only*, and
*required* outside Requirements are review signals, not automatic proof that a
new Requirement exists. Confirm acceptance, subject, and independent value
before extracting one.

## Quality of a requirement is not a quality requirement

The word *quality* has two different uses here:

| Meaning | Question | Applies to |
| --- | --- | --- |
| **Quality of a requirement** | Is the obligation well engineered and expressed? | Every functional, quality, process, human-factors, usability, and constraint requirement |
| **Quality requirement** | What assessable degree or condition of system or product quality is required? | One requirement whose `requirement_type` is `quality` |

A quality Requirement is therefore reviewed twice: as an ordinary requirement
for necessity, correctness, feasibility, and the other statement
characteristics, and as a quality obligation for an assessable outcome in a
defined context. A quality-model label alone does neither job.

## Individual and set quality

An individual requirement should be:

- **necessary** — omission would leave an unmet need or obligation;
- **appropriate** — intent and detail fit the subject and its abstraction
  level without unjustified design restriction;
- **unambiguous** — relevant readers can give it only one intended meaning;
- **complete** — the subject, conditions, outcome, and bounds needed to
  understand the obligation are present;
- **singular** — it states one capability, characteristic, constraint, or
  quality factor;
- **feasible** — it can be realized within applicable constraints and
  acceptable risk;
- **verifiable** — possible evidence could distinguish satisfaction from
  failure;
- **correct** — it faithfully transforms its source need or authority; and
- **conforming** — it follows the adopted requirement notation and style.

These individual characteristics and the distinct set characteristics below
are adapted from ISO/IEC/IEEE 29148:2018.[^iso-29148]

These characteristics interact. For example, splitting a compound statement
can improve singularity while exposing missing conditions; adding a design
mechanism can make a statement more specific while making it inappropriate to
its level.

Individually sound requirements do not guarantee a sound set. A declared set
must also be complete for its stated boundary, internally consistent, feasible
in combination, comprehensible, and able to be validated against its source
needs. Completeness is always a bounded claim. This open-world profile admits
selected architecture-significant requirements and does not by itself claim a
complete system specification. Use [Reviewing a requirement
set](../guides/reviewing-requirement-sets.md) when a system, capability, use
case, baseline, release, or other declared scope needs a set-level conclusion.

## Verification and validation have different objects

The same words are used at several lifecycle stages, so name both the activity
and its object:

| Activity and object | Governing question |
| --- | --- |
| **Requirement verification** | Is the requirement or declared set well formed and organized according to its rules? |
| **Requirement validation** | Does the requirement or declared set correctly represent the source needs and intended outcomes? |
| **Realized-system verification** | Does the implemented subject satisfy the accepted requirements? |
| **Realized-system validation** | Does the realized system meet stakeholder needs in its intended context of use? |

Reviews, scenarios, prototypes, models, analyses, demonstrations, tests, and
operational observations can contribute evidence, depending on the question.
Do not treat a syntactically clean statement as validated, or a passing test as
proof that the requirement was necessary and correct.

## Requirement kind is not verification technique

Classify a requirement by the nature of its obligation:

- functional;
- quality;
- process;
- human factors;
- usability; or
- constraint.

Classify a test or evaluation independently by the evidence technique and
scope it uses. One functional requirement may need an end-to-end scenario, a
focused unit example, and a property test. A unit or property test may instead
protect an implementation detail and need no requirement trace. Collapsing
these axes hides both intent and evidence coverage.

## Traceability with restraint

Useful traceability answers four questions:

1. What architecture subject is obligated?
2. Where did the obligation come from?
3. Which accepted requirement was derived from which parent requirement?
4. What evidence currently supports satisfaction?

The Requirement owns the first answer through `subject` and may own source or
derivation links. Evidence owns the fourth answer by referencing
`requirement_id`. Avoid volatile backlinks from requirements to test files and
implementations; generate reverse views from evidence when needed.

Traceability should help validate meaning and analyze change, not merely fill
a matrix. A source link is useful when a reviewer can follow it to determine
why the obligation exists. A derivation link is useful when changing the
parent would require reconsidering the child.

## Standards boundary

This guidance adapts ISO/IEC/IEEE 29148:2018 and practical INCOSE writing
guidance for a concise architecture corpus. It does not claim conformance to
the standard's complete process or information-item provisions. The 2018
edition remains the published ISO standard but is under active revision;
reassess this guidance when a successor edition is published or the profile's
requirements model changes.

For the focused procedure, see [Documenting
requirements](../guides/documenting-requirements.md). For product-quality
specialization, see [Documenting quality
requirements](../guides/documenting-product-quality-requirements.md). For the
type boundaries and standards crosswalk, see [Classifying requirements in
software architecture](requirement-classification.md).

[^incose-writing-requirements]: INCOSE Guide to Writing Requirements, version
    4, distinguishes well-formed writing from the analysis needed to establish
    correctness and feasibility.
[^iso-29148]: ISO/IEC/IEEE 29148:2018 supplies the requirements-engineering
    process, construct, individual-characteristic, set-characteristic,
    language, and traceability basis adapted here; the ISO catalogue records
    its current revision stage.
[^software-architecture-profile]: The software architecture docs profile
    defines the narrower accepted-Requirement representation and open-world
    corpus boundary used here.
