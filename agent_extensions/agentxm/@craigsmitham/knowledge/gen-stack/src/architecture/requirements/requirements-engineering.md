---
type: Explanation
title: Requirements engineering in software architecture
description: How Intent, Architecture, and recognized sources co-develop into accepted subject-centered obligations, and how requirement quality, validation, verification, traceability, and evidence remain distinct.
tags: [requirements-engineering, requirements, traceability, architecture, verification, validation]
status: draft
sources:
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 — Requirements engineering
  - id: incose-writing-requirements
    resource: https://www.incose.org/docs/default-source/working-groups/requirements-wg/gtwr/incose_rwg_gtwr_v4_040423_final_drafts.pdf
    title: INCOSE Guide to Writing Requirements, version 4
  - id: selecting-method
    resource: selecting-a-requirement-specification-method.md
    title: Selecting a requirement specification method
  - id: gen-stack-profile
    resource: /profile/gen-stack-application-profile.md#requirement
    title: Gen Stack application profile — Requirement
  - id: requirement-change-guide
    resource: /work-items/specifying-requirement-changes.md
    title: Specifying Requirement changes
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:16:50Z
---

# Requirements engineering in software architecture

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

Requirements engineering is not primarily sentence polishing or a phase that
precedes Architecture. It co-develops stakeholder Intent, recognized sources,
candidate Architecture, and candidate obligations into an agreed set of
subject-centered Requirements and an Architecture capable of responding to
them. Writing quality matters, but a clear sentence can still express the
wrong obligation, obligate the wrong subject, or demand an infeasible
response.[^incose-writing-requirements]

This Gen Stack profile addresses one bounded part of that work: preserving
accepted, architecture-significant requirements beside the durable subjects
they obligate. It is not a request-intake process, a complete requirements
management system, or a claim that every behavior of the system has been
specified.[^gen-stack-profile]

## From source concern to maintained evidence

Requirements and Architecture work are iterative rather than a one-way
document pipeline:

```text
                    Intent and recognized sources
                                 │
                     elicit, analyze, model
                                 ▼
              candidate Architecture ⇄ candidate Requirements
                subjects and responses    obligations and constraints
                                 │
             scenarios, prototypes, evaluation design, negotiation
                                 ▼
              accepted Architecture + accepted Requirements
                                 │
                  realization and evaluation evidence
                                 │
             learning, impact analysis, and controlled change
                                 └──────────────────────────↺
```

Intent shapes both candidate Architecture and candidate Requirements.
Architecture provides the subjects, boundaries, responsibilities,
interactions, and response hypotheses needed to discover and place
obligations. Requirements test, constrain, and refine that shape. Prototypes
and evaluation design can reveal that a stated need, proposed obligation, or
architectural response was misunderstood. A change to either side can require
renewed agreement, analysis, and evidence; it should not be treated as a local
prose edit.

Use [Developing candidate Architecture and
Requirements](../developing-candidate-architecture-and-requirements.md) and
[Developing Requirements](developing-requirements.md) for this exploratory,
evidence-bound work. Use [Documenting
requirements](documenting-requirements.md) only after the obligation and its
subject are accepted. This separates development from canonical recording
without imposing a temporal Architecture-first or Requirements-first process.

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

## Architecture and requirements co-develop

Architecture and requirements answer different questions about the same
system. Architecture identifies durable subjects, boundaries,
responsibilities, and relationships. Requirements state the accepted
obligations on those subjects under relevant conditions and bounds.
Implementations realize both; evaluations provide evidence about satisfaction.

Architecture is logically prior as the frame that identifies what exists and
can bear an obligation, but it need not be temporally complete before
Requirement development begins. Candidate obligations frequently reveal
missing subjects, misplaced responsibilities, or untenable boundaries. The
two are therefore developed together while their accepted authority remains
separate.

This architectural frame makes obligations readable relative to the system. A
CLI command, capability, bounded context, or component can own a coherent
group of Requirements without making a test runner's unit, integration, or
end-to-end hierarchy the primary reader model.

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

Not every expression that influences change is a Requirement. “The Billing
context owns posted-invoice state” assigns architecture authority. “At every
commit, the Billing context shall preserve the posted-invoice total” states an
obligation in structured natural language. Architecture may explain the
authority and preservation response, but the Requirement remains the sole
local authority for the accepted obligation.

The profile's conformance rules and its required corpus-governance policies
govern the documentation itself; they are not Requirements of the documented
System. When lifecycle, decision, ownership, or assurance context introduces
an independently maintained obligation on system development, operation, or
governance, represent that obligation as a `process` Requirement and link it
from the kernel concept.

Words such as *shall*, *must*, *guarantee*, *preserve*, *prohibit*, *only*, and
*required* outside Requirements are review signals, not automatic proof that a
new Requirement exists. A method may use another normative notation, so judge
authority from the accepted Requirement and the declared role of its
representations rather than from one keyword. Confirm acceptance, subject, and
independent value before extracting an obligation.

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
set](/architecture/requirements/reviewing-requirement-sets.md) when a system, capability, use
case, baseline, release, or other declared scope needs a set-level conclusion.

## Specification methods serve requirement quality

Gen Stack is method-open and quality-governed. A Requirement may use structured
or ordinary natural language, a quantitative form, a predicate, a contract, a
table, a state model, a schema, a formal expression, an incorporated normative
reference, or another suitable method. Documented methods are examples and
reusable guidance, not an allowlist.

Different methods expose different defects. Structured language can reveal
missing conditions and compound responses; decision tables can reveal missing
or overlapping combinations; state models can reveal unreachable states and
incomplete transitions; and formal analysis can produce counterexamples within
its declared model and bounds. None of them establishes that the obligation is
necessary, accepted, correct, feasible, or complete in a set merely by being
well formed.

Select the method by the obligation's dominant semantic difficulty, intended
readers, consequence, and lifecycle cost. Then apply the same individual and
set quality criteria. Use [Selecting a requirement specification
method](selecting-a-requirement-specification-method.md) for the open selection
process and the authority boundaries of the resulting artifacts.

## Verification and validation have different objects

The same words are used at several lifecycle stages, so name both the activity
and its object:

| Activity and object | Governing question |
| --- | --- |
| **Requirement verification** | Is the requirement expression or declared set well formed and organized according to its applicable rules? |
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

## Controlled Requirement change

Acceptance establishes a Requirement as active desired state; it does not make
the Requirement immutable. Controlled change begins with impact analysis, then
specifies an explicit desired-state delta before canonical mutation. The
primitive operations are addition, revision, and retirement. Replacement,
split, and merge compose retirement with one or more additions and explicit
supersession lineage. Representation-only corrections and unresolved questions
are not Requirement changes unless accepted meaning changes.

Lifecycle, implementation satisfaction, and evidence validity are independent:

| Dimension | Question |
| --- | --- |
| Requirement lifecycle | Is the accepted obligation currently `active` or retained as `retired` history? |
| Implementation satisfaction | Does the realized subject currently satisfy the active obligation? |
| Evidence validity | Does a particular Evaluation Result still support its exact target and interpretation? |

Retirement therefore preserves the canonical record, stable identifier, last
accepted expression, rationale, sources, and decision provenance while ending
its normative force. A successor points to each retired predecessor through
`supersedes`; that lineage does not establish equivalence, derivation, or
transfer historical evidence. Subject changes, splits, and merges require
explicit identity decisions because they alter what the obligation is about or
how independently it can be accepted and satisfied.

Use [Specifying Requirement
changes](/work-items/specifying-requirement-changes.md) for the full workflow,
including action-specific blockers, partial acceptance, canonicalization, and
downstream reconciliation.

## Standards boundary

This guidance adapts ISO/IEC/IEEE 29148:2018 and practical INCOSE writing
guidance for a concise Gen Stack corpus. It does not claim conformance to
the standard's complete process or information-item provisions. The 2018
edition remains the published ISO standard but is under active revision;
reassess this guidance when a successor edition is published or the profile's
requirements model changes.

For the focused procedure, see [Documenting
requirements](/architecture/requirements/documenting-requirements.md). For product-quality
specialization, see [Documenting quality
requirements](/architecture/requirements/documenting-product-quality-requirements.md). For the
type boundaries and standards crosswalk, see [Classifying requirements in
software architecture](requirement-classification.md).

[^incose-writing-requirements]: INCOSE Guide to Writing Requirements, version
    4, distinguishes well-formed writing from the analysis needed to establish
    correctness and feasibility.
[^iso-29148]: ISO/IEC/IEEE 29148:2018 supplies the requirements-engineering
    process, construct, individual-characteristic, set-characteristic,
    language, and traceability basis adapted here; the ISO catalogue records
    its current revision stage.
[^gen-stack-profile]: The Gen Stack profile
    defines the narrower accepted-Requirement representation and open-world
    corpus boundary used here.
