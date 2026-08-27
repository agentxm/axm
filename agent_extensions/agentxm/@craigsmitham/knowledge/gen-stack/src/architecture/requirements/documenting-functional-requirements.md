---
type: Guide
title: Documenting functional requirements
description: Use when an accepted obligation specifies behavior, response, transformation, state transition, or preservation; document one functional Requirement without confusing it with quality, constraints, or implementation.
tags: [architecture-documentation, requirements, functional-requirements, behavior, invariants]
status: draft
sources:
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
  - id: requirement-classification
    resource: /architecture/requirements/requirement-classification.md
    title: Classifying requirements in software architecture
  - id: selecting-method
    resource: selecting-a-requirement-specification-method.md
    title: Selecting a requirement specification method
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 — Requirements engineering
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:12:18Z
---

# Documenting functional requirements

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when the primary accepted obligation is behavior: a response,
service, transformation, calculation, information exchange, state transition,
failure outcome, recovery action, or preserved predicate.

## Representation

Inherit the native OKF and profile representation from [Documenting
requirements](documenting-requirements.md), set `requirement_type: functional`
once classification is established, and add no parallel type section. In the
canonical expression, prefer this logical order when applicable: condition or
trigger, obligated subject, required behavior or state transition, bounds, and
material failure, recovery, or no-op outcomes. The selected specification
method may change the syntax, not these semantic distinctions.

## 1. Establish the behavioral boundary

Follow [Documenting requirements](documenting-requirements.md), then identify:

- the architecture subject responsible for the behavior;
- the trigger, input, precondition, or state in which it applies;
- the observable result or state transition;
- material failure, rejection, recovery, and no-op outcomes; and
- any bounds that are part of the behavior rather than its evaluation method.

Set `requirement_type: functional` only after confirming that the primary
obligation is what the subject does, not how well it does it or how it must be
implemented.

## 2. Express one outcome

Use [Selecting a requirement specification
method](selecting-a-requirement-specification-method.md). Event-response
behavior often fits [EARS](writing-requirements-with-ears.md); preservation
often fits an invariant or predicate; stateful protocols may need a transition
model; and combinatorial rules may need a decision table. These choices are
illustrative rather than exhaustive.

Common structured-language forms include:

> When `[desired trigger]`, `[subject]` shall `[observable result]`.

> If `[invalid or failure trigger]`, then `[subject]` shall `[rejection,
> recovery, or preserved-state outcome]`.

> While `[continuing state]`, `[subject]` shall `[observable behavior or
> preserved condition]`.

> At every `[observation boundary]`, `[subject]` shall preserve `[predicate]`.

The first three forms apply EARS to desired events, unwanted behavior, and
continuing states. The last is a specialized invariant formulation rather
than one of the five simple EARS patterns; use [Expressing
invariants](expressing-invariants.md) when universal preservation across a
declared observation boundary is the intended claim. A table or model may be
clearer when several transitions or rule combinations form one obligation.
“Balances are always correct” is not sufficiently bounded; “After each
committed ledger transition …” identifies when the predicate must hold.

## 3. Keep neighboring semantics distinct

- A response-time, throughput, availability, accuracy, or other assessable
  degree is usually a `quality` Requirement.
- A mandated protocol, database, framework, region, or interface format is a
  `constraint` Requirement.
- A user goal achieved effectively or efficiently in context is a `usability`
  Requirement.
- A durable review, approval, or operational exercise is a `process`
  Requirement.
- An allocation of responsibility or state authority is architecture; create
  a Requirement only for an independently accepted obligation on that subject.

Interface behavior remains functional when the obligation concerns the
information or response exchanged. The fact that it crosses an interface does
not make `interface` another profile type.

## 4. Review behavior and precision

Ask whether:

- the stated subject actually owns the outcome;
- the condition and outcome cover the accepted case without hiding another
  independently changeable obligation;
- logical alternatives and negative cases have one intended meaning;
- defined terms or models own exact domain predicates where prose would drift;
- design mechanics have been removed unless separately accepted as
  constraints; and
- credible evidence could distinguish the required behavior from failure.

Scenarios and examples can expose omissions, but they remain sources or
evidence rather than becoming a second normative statement.

## Example

Weak:

> The importer shall recover correctly.

Synthetic functional Requirement:

> If an import worker stops before committing a batch, then the import
> coordinator shall make every record in that batch eligible for a later
> attempt without marking any record as accepted.

Recovery time and availability targets would be separate quality obligations
if independently accepted. A mandated checkpoint store would be a constraint.
