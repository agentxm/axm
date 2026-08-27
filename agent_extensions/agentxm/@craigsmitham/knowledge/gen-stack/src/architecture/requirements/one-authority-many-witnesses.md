---
type: Principle
title: One authority, many witnesses
description: Why an accepted Requirement has one normative authority while architecture, implementation, tests, evaluations, and telemetry may repeat its predicate for different purposes.
tags: [requirements, authority, evaluations, tests, redundancy, evidence, mece]
---

# One authority, many witnesses

Give each accepted obligation one normative Requirement authority, then allow
multiple independent representations to realize, evaluate, and observe it.

## Good protected

The principle protects both clarity of Intent and confidence in Implementation.
One authority prevents competing `shall` statements from drifting. Many
witnesses reduce the blind spots of any single representation or evaluation
technique.

## Authority model

| Representation | What it owns |
| --- | --- |
| Requirement | The local decision to adopt an obligation, its canonical normative expression, eligible Architecture subject, and stable identity |
| Incorporated normative reference | The referenced definitions and conformance semantics for the identified provisions; it does not own the local decision to adopt them |
| Supporting model or view | An explanatory or analytical representation whose normative role and precedence are explicit |
| Architecture | Responsibility, authority, boundaries, decisions, relationships, and the response to the Requirement |
| Implementation | The current realization |
| Evaluation definition | The method, cases, oracle, thresholds, and conditions used to assess the Requirement |
| Evaluation execution and result | What ran and what was observed in one bounded attempt |
| Runtime observation | What happened in an operating system under stated conditions |
| Governance decision | Whether available evidence is sufficient for a release, exception, rollback, or other decision |

An executable check may intentionally repeat a Requirement almost word for
word. That redundancy is useful because the two artifacts answer different
questions: the Requirement owns what is required; the evaluation asks
whether a realized subject satisfies it. The check should reference the stable
`requirement_id` when it claims that coverage.

What must be removed is duplicate **normative authority**: two independently
maintained statements that can each purport to change the obligation. MECE is
useful for assigning semantic authority, not for forcing every representation
of a predicate to exist in exactly one place.

## Judgment

- Keep an accepted Requirement even when code or tests make the same predicate
  easy to infer. `Is`, `passes`, and `was observed` do not establish a local
  obligation.
- Permit multiple representations inside one Requirement when they clarify
  different aspects of the same obligation. Name which representation is
  normative, explanatory, or derived and define precedence if they can differ.
- Prefer evaluation diversity that has genuinely different blind spots, such
  as an example, property check, analysis, and runtime measure. Several checks
  generated from the same ambiguous interpretation are redundant in volume,
  not independent in understanding.
- Keep implementation-local tests local when they do not claim Requirement
  coverage.
- Do not allow a failing or newly passing evaluation to rewrite the
  Requirement automatically. Classify the disagreement and route it to the
  authority that can decide.

## Common misreadings

- **“Single source of truth means one artifact.”** It means one normative
  authority for the obligation, not one representation of the predicate.
- **“Tests are documentation, so Requirements are redundant.”** Tests document
  an evaluator or implementation state; they do not by themselves establish
  accepted intent.
- **“Repeated wording is always drift.”** Repeated binding authority is drift
  risk. Repeated executable predicates with explicit relationships are often
  the point of assurance.
