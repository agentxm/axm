---
type: Guide
title: Documenting requirements
description: How to transform one accepted obligation into a subject-centered Requirement, review its engineering and wording, preserve rationale and traceability, and connect it to architecture and evidence.
tags: [architecture-documentation, requirements, requirements-engineering, traceability, specification]
status: draft
sources:
  - id: software-architecture-profile
    resource: ../architecture-documentation/software-architecture-application-profile.md#requirement
    title: Software architecture docs application profile — Requirement
  - id: requirements-engineering
    resource: ../foundations/requirements-engineering.md
    title: Requirements engineering in software architecture
  - id: requirement-classification
    resource: ../foundations/requirement-classification.md
    title: Classifying requirements in software architecture
  - id: incose-writing-requirements
    resource: https://www.incose.org/docs/default-source/working-groups/requirements-wg/gtwr/incose_rwg_gtwr_v4_040423_final_drafts.pdf
    title: INCOSE Guide to Writing Requirements, version 4
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:19:59Z
---

# Documenting requirements

Use this guide to create one accepted Requirement that a reader can understand,
an architecture can respond to, and evidence can reference. The result is not
merely a well-formed sentence: its source, subject, necessity, feasibility, and
correctness must also withstand review.[^requirements-engineering]

## Before you start

Confirm that:

- an applicable authority has accepted the obligation, not merely requested or
  proposed it;
- the source need, policy, use case, risk, decision, or parent requirement is
  available for validation;
- one eligible architecture subject owns the obligation; and
- the architecture corpus is the intended authority for this durable
  Requirement.

If the obligation or subject is still undecided, keep the material in its
request, need, proposal, investigation, or decision lifecycle. Do not turn
uncertainty into accepted architecture merely to complete a document.

Before drafting, distinguish the obligation from neighboring meaning:

- architecture identifies the subject, its responsibility, authority,
  boundary, and relationships;
- a source concept explains the need, scenario, policy, risk, or decision from
  which the obligation arises;
- the Requirement alone states the accepted obligation; and
- implementation and evidence own enforcement mechanics and current
  satisfaction.

Treat an accepted invariant, guarantee, prohibition, boundary rule, required
failure or recovery outcome, binding dependency direction, or independently
maintained system-process rule in the governed scope as a Requirement. Its
admission does not depend on whether code or tests make the predicate easy to
infer. Do not create a parallel invariant, guarantee, or policy record as a
second normative authority for the same obligation.

## 1. Establish the source and intended outcome

State in working notes:

- who or what needs the outcome;
- the circumstances in which it matters;
- the problem, risk, or obligation that makes it necessary;
- the outcome the subject must provide; and
- applicable constraints, assumptions, conflicts, or higher-level
  requirements.

This analysis may reveal that the source concern should produce several
requirements, a use case, an architecture decision, or no requirement at all.
Preserve the source faithfully even when analysis rejects its proposed
solution.

## 2. Choose the subject, level, and type

Identify the canonical architecture subject before drafting. The subject fixes
which thing is obligated and the abstraction level at which the outcome should
be stated. If no eligible subject exists, decide separately whether the
missing architecture concept deserves durable identity.

Classify the obligation as `functional`, `quality`, `process`,
`human-factors`, `usability`, or `constraint`. Classify it by what is required,
not by the source label, clause form, or test technique likely to provide
evidence. Use [Classifying requirements in software
architecture](../foundations/requirement-classification.md) for the decision
boundaries, then apply the focused guide for the selected type:

| Type | Focused guide |
| --- | --- |
| `functional` | [Documenting functional requirements](documenting-functional-requirements.md) |
| `quality` | [Documenting quality requirements](documenting-product-quality-requirements.md) |
| `process` | [Documenting process requirements](documenting-process-requirements.md) |
| `human-factors` | [Documenting human-factors requirements](documenting-human-factors-requirements.md) |
| `usability` | [Documenting usability requirements](documenting-usability-requirements.md) |
| `constraint` | [Documenting constraint requirements](documenting-architecture-constraints.md) |

Avoid implementation detail unless the mechanism itself is an accepted
constraint. A requirement on a system should normally state the required
outcome; derived requirements can later constrain lower-level subjects when
architecture decisions justify them.

## 3. Draft one observable obligation

This profile uses the following structured natural-language pattern:

> When `[relevant condition]`, `[subject]` shall `[required outcome]`
> `[within relevant bounds]`.

Conditions and bounds are optional only when the intended scope remains
unambiguous without them. Use `shall` because it is the profile's binding
keyword, not because that word can turn an unaccepted idea into a requirement.
In governed corpus concepts, reserve author-authored binding `shall`
statements for this section of a Requirement.

Adapt the pattern to the obligation without changing its ownership:

| Obligation semantics | Useful formulation |
| --- | --- |
| Invariant | At every `[observation boundary]`, `[subject]` shall preserve `[predicate]`. |
| Prohibition | When `[condition]`, `[subject]` shall not `[forbidden outcome]`. |
| Boundary guarantee | When `[interaction crosses boundary]`, `[subject]` shall `[required guarantee]`. |
| Process | When `[trigger]`, `[subject or its governed process]` shall `[required review, approval, production, or operational outcome]`. |

`Invariant` is not a requirement type. Choose `functional`, `quality`,
`process`, `human-factors`, `usability`, or `constraint` according to what is
required, while the statement preserves the invariant semantics.

While drafting:

- name the subject explicitly and use active voice;
- state what is needed rather than how to implement it;
- use defined terms and consistent units;
- replace vague qualities such as *fast*, *gracefully*, *appropriate*, or
  *user-friendly* with an observable outcome or defined criterion;
- avoid vague pronouns, open-ended clauses, incomplete references, and
  unbounded comparisons;
- separate obligations joined by `and`, `or`, or `and/or` when they can be
  satisfied, changed, or evaluated independently; and
- keep definitions, assumptions, rationale, examples, and verification
  procedures outside the binding statement.

These language checks adapt the structured-natural-language practices in the
INCOSE writing guide.[^incose-writing-requirements]

A qualitative outcome can be valid when it is still unambiguous and
verifiable. Do not invent a number merely to make a statement look rigorous.

## 4. Preserve rationale and traceability

Under `## Rationale`, explain why the requirement exists or what consequence
it prevents. Add `requirement_sources` when a maintained concept or external
authority lets a reviewer validate that rationale. Use `derived_from` only
when the obligation follows from a maintained parent Requirement.

Do not hide assumptions in the binding statement. Validate them and preserve
them with the source, rationale, decision, or other authority that manages
them.

## 5. Verify the individual requirement

Review the candidate before admission:

| Characteristic | Review question | Typical repair |
| --- | --- | --- |
| Necessary | What unmet need, obligation, or unacceptable consequence would omission leave? | Link the source and rationale, or remove an unsupported requirement. |
| Appropriate | Does the intent and detail belong to this subject and level? | Move a lower-level obligation to its subject or separate a true constraint from a preferred design. |
| Unambiguous | Could relevant readers reasonably give the statement different meanings? | Define terms, name the subject and condition, replace vague words, and resolve logical alternatives. |
| Complete | Are the subject, applicable condition, outcome, and necessary bounds sufficient to interpret it? | Add only the missing information required to understand the obligation. |
| Singular | Does it state one independently satisfiable and changeable obligation? | Split compound outcomes while preserving their common source. |
| Feasible | Can it be realized within applicable technical, cost, schedule, legal, and risk constraints? | Analyze, negotiate, revise, or reject it; prose cannot repair infeasibility. |
| Verifiable | Could credible evidence distinguish satisfaction from failure? | Make the observable outcome, criterion, context, or tolerance explicit without prescribing the method. |
| Correct | Does it faithfully transform the source need or authority? | Validate with the source and correct the obligation, not merely its wording. |
| Conforming | Does it follow this profile and the corpus's approved terminology and identifier convention? | Apply the local form after the engineering meaning is sound. |

Passing a wording check does not establish necessity, feasibility, or
correctness. Those require source, stakeholder, domain, architecture, and
delivery evidence appropriate to the obligation.

## 6. Validate the meaning

Review the candidate with the applicable source authority and affected
stakeholders. Ask whether satisfying this requirement would contribute to the
intended need under the stated conditions, whether material cases are absent,
and whether the wording introduces a solution or tradeoff that was not
accepted.

Scenarios, prototypes, models, simulations, and examples can expose mistaken
interpretations or omissions. They inform validation; they do not become the
Requirement's normative authority. An accepted obligation is represented as a
Requirement even when one of these sources supplies nearly identical wording.

## 7. Admit and place the Requirement

After verification, validation, and agreement:

1. Assign a stable, bundle-unique `requirement_id` under the corpus's
   documented identifier convention.
2. Create the file at
   `<subject-without-.md>/requirements/<requirement_type>/<requirement>.md`.
3. Add only the indexes this first concept earns.
4. Set `subject` to the canonical bundle-relative concept link.
5. Put the binding statement under `## Requirement` and its rationale under
   `## Rationale`.
6. Add source and derivation relations only when they communicate real
   traceability.

The normative fields and eligible subjects are defined by the [software
architecture docs
profile](../architecture-documentation/software-architecture-application-profile.md#requirement).[^software-architecture-profile]

## 8. Connect architecture and evidence

Link Requirement concepts from decisions or architecture concepts that respond
to them. Let tests, evaluations, measures, telemetry, or assurance plans
reference `requirement_id`; do not add a verification-method field or a
volatile inventory of test files to the Requirement. A test or evaluation MAY
repeat the Requirement predicate, even nearly word for word, because it owns an
assessment definition rather than desired-state authority. Preserve that
useful redundancy while keeping the relationship explicit.

Replace any former binding formulation in the architecture concept with a
relationship to the Requirement and an explanation of the subject,
responsibility, boundary, or architecture response. A source such as a Use Case
may retain the scenario or desired outcome that justifies the Requirement, but
it must not present itself as a second normative `shall` authority.

Evidence that a realization satisfies the Requirement is different from the
earlier verification that the statement is well formed and validation that it
correctly represents its source need.

## 9. Review changes as engineering changes

When the source, subject, condition, bound, or outcome changes, analyze impact
on derived requirements, architecture decisions, realization, and evidence.
Retain the stable identifier for ordinary evolution; do not reuse an identifier
after retirement. Let the authority that manages acceptance and change decide
whether the revision requires renewed agreement or a new Requirement.

## Examples and repairs

### Replace vague behavior

Weak:

> The CLI should handle installation failures gracefully.

Stronger:

> When installation cannot complete, the CLI install command shall leave the
> workspace in its pre-installation state.

The stronger statement names the binding subject, condition, and observable
outcome. Its rationale and source must still establish that the outcome is
necessary, feasible, and correct.

### Split independent obligations

Compound:

> When a reservation is rejected, the reservation service shall preserve
> available capacity and notify the requester.

Split this when preservation and notification can change or be evaluated
independently:

> When a reservation is rejected, the reservation service shall leave
> available capacity unchanged.

> When a reservation is rejected, the reservation service shall identify the
> rejection to the requester.

### Remove an unaccepted design choice

Over-prescribed:

> The reservation service shall use a distributed cache to make capacity
> checks fast.

Outcome-oriented:

> While accepting reservation requests, the reservation service shall decide
> against capacity committed by all accepted requests.

The outcome still needs explicit consistency and timing bounds when those are
material. If a distributed cache is itself an accepted constraint, document
that obligation separately with its authority and consequences.

### Recognize well-formed but unproven meaning

> For every valid reservation request, the reservation service shall return a
> decision within 5 milliseconds.

This is grammatically clear, singular, and apparently verifiable. It is not
ready merely for those reasons: the source must establish why 5 milliseconds
is necessary, analysis must show it is feasible in the intended environment,
and stakeholders must agree that it correctly represents the need.

## Next review

Review a declared group with [Reviewing a requirement
set](reviewing-requirement-sets.md). A collection of individually strong
Requirements can still be incomplete, inconsistent, infeasible in combination,
or unable to deliver the intended outcome.

[^incose-writing-requirements]: INCOSE Guide to Writing Requirements, version
    4, supplies practical structured-language rules and examples aligned with
    requirements characteristics.
[^requirements-engineering]: Requirements engineering in software architecture
    explains the lifecycle, quality, verification, validation, and authority
    distinctions applied by this procedure.
[^software-architecture-profile]: The software architecture docs profile is
    normative for Requirement metadata, statement form, eligible subjects,
    paths, and relationship fields.
