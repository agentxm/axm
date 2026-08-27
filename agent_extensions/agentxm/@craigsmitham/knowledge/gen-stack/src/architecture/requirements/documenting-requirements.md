---
type: Guide
title: Documenting requirements
description: Use when an accepted obligation needs canonical subject-centered expression; transform it into a Requirement, review its engineering, preserve rationale and traceability, and connect it to architecture and evidence.
tags: [architecture-documentation, requirements, requirements-engineering, traceability, specification]
status: draft
sources:
  - id: gen-stack-profile
    resource: /profile/gen-stack-application-profile.md#requirement
    title: Gen Stack application profile — Requirement
  - id: requirements-engineering
    resource: /architecture/requirements/requirements-engineering.md
    title: Requirements engineering in software architecture
  - id: requirement-classification
    resource: /architecture/requirements/requirement-classification.md
    title: Classifying requirements in software architecture
  - id: selecting-method
    resource: selecting-a-requirement-specification-method.md
    title: Selecting a requirement specification method
  - id: requirement-change-guide
    resource: /work-items/specifying-requirement-changes.md
    title: Specifying Requirement changes
  - id: incose-writing-requirements
    resource: https://www.incose.org/docs/default-source/working-groups/requirements-wg/gtwr/incose_rwg_gtwr_v4_040423_final_drafts.pdf
    title: INCOSE Guide to Writing Requirements, version 4
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T01:11:07Z
---

# Documenting requirements

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide to create one accepted Requirement that a reader can understand,
an architecture can respond to, and evidence can reference. The result is not
merely a well-formed sentence: its source, subject, necessity, feasibility, and
correctness must also withstand review.[^requirements-engineering]

A Requirement is the canonical accepted expression of an obligation arising
from Intent or another recognized source. Its sources preserve why the
obligation exists; its `subject` identifies exactly one eligible Architecture
concept that is obligated.

Requirements cannot be developed independently of Architecture. This guide
records an obligation and subject whose meaning is already accepted. When the
obligation or its subject is missing, inferred, underdeveloped, misplaced, or
disputed, use [Developing Requirements](developing-requirements.md) and the
shared [candidate-development
guide](../developing-candidate-architecture-and-requirements.md) first. Direct
accepted authoring does not require repeating candidate-development ceremony.

## Before you start

Confirm that:

- an applicable authority has accepted the obligation, not merely requested or
  proposed it;
- the source need, policy, use case, risk, accepted Architecture decision or
  responsibility analysis, or parent requirement is available for validation;
- one eligible architecture subject owns the obligation; and
- the Gen Stack corpus is the intended authority for this durable
  Requirement.

If the obligation or subject is still undecided, keep the material in its
request, need, proposal, diagnostic evidence, or decision lifecycle. Do not turn
uncertainty into accepted Architecture merely to complete a document. Route
the decision through [Developing Requirements](developing-requirements.md).

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

## Representation

Use the OKF envelope and the profile's exact `Requirement` type, colocation,
`requirement_id`, `requirement_type`, `requirement_lifecycle`, `subject`, and
applicable lineage, source, quality, or relationship fields. Do not duplicate
those fields in a body metadata block. The profile-required body order is
`## Requirement`, then `## Rationale`, plus `## Lifecycle` for a retired
Requirement. Within those sections, lead with the one canonical expression,
then the accepted reason and source context, and finally retirement decision
Provenance when applicable. Additional tables, models, or references remain
subordinate representations with explicit roles and precedence.

## 1. Establish the source and intended outcome

State in working notes:

- who or what needs the outcome;
- the circumstances in which it matters;
- the problem, risk, or obligation that makes it necessary;
- the outcome the subject must provide; and
- applicable constraints, assumptions, conflicts, or higher-level
  requirements.

Confirm the accepted source and intended outcome that justified the
Requirement. If this check instead reveals several candidate obligations, a
Use Case, an Architecture decision or change, or no Requirement at all, stop
canonical authoring and return to [Developing
Requirements](developing-requirements.md). Preserve the source faithfully
without allowing it to become a competing normative formulation.

## 2. Choose the subject, level, and type

Confirm the accepted Architecture subject before drafting. The subject fixes
which thing is obligated and the abstraction level at which the outcome should
be stated. Subject selection is architectural judgment, not a clerical
placement step. If review exposes a missing or misplaced subject, stop
canonical authoring and return to candidate Architecture and Requirement
development rather than admitting either as accepted to complete the other.

Do not use an Offering, Audience, Need, Job to Be Done, Value Proposition, Use
Case, or Subdomain as the subject. Those concepts may preserve the Intent or
problem-space source from which the Requirement is derived.

Classify the obligation as `functional`, `quality`, `process`,
`human-factors`, `usability`, or `constraint`. Classify it by what is required,
not by the source label, clause form, or test technique likely to provide
evidence. Use [Classifying requirements in software
architecture](/architecture/requirements/requirement-classification.md) for the decision
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

## 3. Select and apply a specification method

Use [Selecting a requirement specification
method](selecting-a-requirement-specification-method.md) to diagnose the
obligation's dominant semantic difficulty and choose any method that expresses
it faithfully at proportionate lifecycle cost. EARS, quantitative forms,
invariants, contracts, tables, state models, schemas, formal expressions,
incorporated normative references, and examples are possibilities, not a
closed list or a ranking.

The Requirement concept remains the canonical local authority for one accepted
obligation. Within `## Requirement`:

- identify the obligated subject consistently with the `subject` link;
- make applicability, outcome, predicate, limitation, or conformance target
  explicit enough for the selected method;
- include material bounds, units, quantifiers, versions, tolerances, or
  exceptions when omitting them would broaden or obscure the obligation;
- keep independently accepted, changeable, or satisfiable obligations
  separate; and
- distinguish the normative expression from any explanation, example,
  supporting model, or incorporated reference.

A Requirement may use more than one representation when their authority and
precedence are unambiguous. A human-readable explanation can accompany a
formal expression; a decision table can define a rule while examples exercise
selected rows; and an external standard can supply incorporated conformance
semantics. Do not let those representations become independently maintained
local obligations.

When the normative expression uses natural language:

- name the subject explicitly and prefer active voice;
- use a binding modal such as `shall` consistently with the selected form;
- state what is needed rather than how to implement it;
- use defined terms and consistent units;
- replace vague qualities such as *fast*, *gracefully*, *appropriate*, or
  *user-friendly* with an observable outcome or defined criterion;
- avoid vague pronouns, open-ended clauses, incomplete references, and
  unbounded comparisons; and
- separate conjunctions when they contain independent obligations.

These language checks adapt the structured-natural-language practices in the
INCOSE writing guide.[^incose-writing-requirements] Other methods need their
own syntax, semantics, interpretation, and review checks. Method conformance
does not turn an unaccepted idea into a Requirement.

Keep rationale, source interpretation, evaluation procedures, and current
evidence outside the normative expression. A qualitative outcome can be valid
when it is still unambiguous and verifiable; do not invent a number merely to
make an obligation look rigorous.

## 4. Preserve rationale and traceability

Under `## Rationale`, explain why the requirement exists or what consequence
it prevents. Add `requirement_sources` when a maintained concept or external
authority lets a reviewer validate that rationale. An accepted Architecture
concept or decision or a responsibility analysis may be a source when it
establishes why a derived obligation exists; it does not thereby own the
obligation. Use `derived_from` only when the obligation follows from a
maintained parent Requirement.

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
| Conforming | Does it follow the selected method, this profile's representation rules, and the corpus's approved terminology and identifier convention? | Apply method-specific checks after the engineering meaning is sound; for EARS, run its [final statement check](writing-requirements-with-ears.md#8-check-the-final-statement). |

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
5. Set `requirement_lifecycle: active`; acceptance and current implementation
   satisfaction remain separate concerns.
6. Put the canonical normative expression under `## Requirement`, make the
   roles of any additional representations explicit, and put its rationale
   under `## Rationale`.
7. Add `requirement_sources` and `derived_from` only when they communicate real
   traceability. Keep `subject`, `requirement_sources`, and `derived_from` as
   their authoritative encodings; do not duplicate them under `relationships`.
8. Record incorporated standards under
   `relationships.incorporates-normative-reference` when the Requirement
   adopts their definitions or conformance semantics.
9. Treat governed reciprocal views on subjects, internal sources, parent
   Requirements, ADR responses, and internal normative references as derived.

The normative fields and eligible subjects are defined by the [software
architecture docs
profile](/profile/gen-stack-application-profile.md#requirement).[^gen-stack-profile]

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
it must not present itself as a second normative authority.

Evidence that a realization satisfies the Requirement is different from the
earlier verification that the statement is well formed and validation that it
correctly represents its source need.

Do not author reciprocal relationship roles on the Requirement independently.
After editing an assertion source, relationship synchronization must report no
changes.

## 9. Review changes as engineering changes

When the source, subject, type, condition, bound, outcome, incorporated
reference, or lifecycle changes, apply [Specifying Requirement
changes](/work-items/specifying-requirement-changes.md). Analyze the candidate
delta before editing canonical desired state, preserve the decision and its
authority, and reconcile affected sources, derived Requirements, Architecture,
realization, Evaluation Protocols, and evidence routes.

Retain the identifier for a revision only when the accepted obligation keeps
its identity. A subject change is identity-significant and requires an explicit
decision. Splits and merges create new identifiers. Retirement changes
`requirement_lifecycle` to `retired`, preserves the historical record and its
last accepted expression, and records the decision under `## Lifecycle`; never
delete the Requirement or reuse its identifier. A successor records retired
predecessor identifiers in `supersedes`. Supersession preserves lineage but
does not transfer evidence or imply that the successor is equivalent to, or
derived from, its predecessor.

## Examples and repairs

### Replace vague behavior

Weak:

> The CLI should handle installation failures gracefully.

Stronger:

> If installation cannot complete, then the CLI install command shall leave
> the workspace in its pre-installation state.

The stronger statement names the binding subject, condition, and observable
outcome. Its rationale and source must still establish that the outcome is
necessary, feasible, and correct.

### Split independent obligations

Compound:

> If a reservation is rejected, then the reservation service shall preserve
> available capacity and notify the requester.

Split this when preservation and notification can change or be evaluated
independently:

> If a reservation is rejected, then the reservation service shall leave
> available capacity unchanged.

> If a reservation is rejected, then the reservation service shall identify
> the rejection to the requester.

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
[^gen-stack-profile]: The Gen Stack profile is
    normative for Requirement metadata, statement form, eligible subjects,
    paths, and relationship fields.
