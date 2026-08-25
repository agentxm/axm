---
type: Guide
title: Documenting functional requirements
description: How to document one accepted behavior, response, transformation, state transition, or preservation obligation without confusing it with quality, constraints, or implementation.
tags: [architecture-documentation, requirements, functional-requirements, behavior, invariants]
status: draft
sources:
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
  - id: requirement-classification
    resource: ../foundations/requirement-classification.md
    title: Classifying requirements in software architecture
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 — Requirements engineering
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:47:49Z
---

# Documenting functional requirements

Use this guide when the primary accepted obligation is behavior: a response,
service, transformation, calculation, information exchange, state transition,
failure outcome, recovery action, or preserved predicate.

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

## 2. Draft one outcome

Useful forms include:

> When `[trigger or condition]`, `[subject]` shall `[observable result]`.

> When `[invalid or failure condition]`, `[subject]` shall `[rejection,
> recovery, or preserved-state outcome]`.

> At every `[observation boundary]`, `[subject]` shall preserve `[predicate]`.

An invariant-shaped functional requirement needs an explicit state and
observation boundary. “Balances are always correct” is not sufficiently
bounded; “After each committed ledger transition …” identifies when the
predicate must hold.

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

> When an import worker stops before committing a batch, the import
> coordinator shall make every record in that batch eligible for a later
> attempt without marking any record as accepted.

Recovery time and availability targets would be separate quality obligations
if independently accepted. A mandated checkpoint store would be a constraint.
