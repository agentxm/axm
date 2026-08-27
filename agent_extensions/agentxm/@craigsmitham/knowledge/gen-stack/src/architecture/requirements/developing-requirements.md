---
type: Guide
title: Developing Requirements
description: Use when intent, a change, a defect, or implementation evidence suggests a missing, underdeveloped, misplaced, or disputed obligation; develop a candidate Requirement and subject without treating inference, derivation, or a test as acceptance.
tags: [requirements-development, candidate-requirements, requirements-engineering, brownfield, greenfield, evidence, derivation, subject-placement]
status: draft
sources:
  - id: shared-candidate-development
    resource: ../developing-candidate-architecture-and-requirements.md
    title: Developing candidate Architecture and Requirements
  - id: requirements-engineering
    resource: requirements-engineering.md
    title: Requirements engineering in software architecture
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:07:37Z
---

# Developing Requirements

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). It develops candidate
> Requirements; the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs only accepted
> Requirement representation.

Use this guide after the shared [candidate-development
guide](../developing-candidate-architecture-and-requirements.md) identifies a
possible obligation or a problem with an existing one. For an obligation and
subject already accepted by the applicable authority, go directly to
[Documenting requirements](documenting-requirements.md).

## Representation

Keep the result in the native candidate or decision surface; do not create a
governed Requirement. Present each independently decidable candidate in this
preferred order: source and evidence, candidate expression, proposed subject
and type, inference or derivation basis, rationale, feasibility and
observability, conflicts and impact, recommendation, blockers, and acceptance
authority. Omit inapplicable detail and do not assign `requirement_id`,
profile lifecycle, canonical path, or frontmatter before admission.

## 1. Establish the candidate source

Preserve the need, scenario, policy, risk, external authority, parent
Requirement, accepted Architecture decision, responsibility analysis, or
observed discrepancy that motivates the candidate. State what is fact,
interpretation, hypothesis, proposed desired state, and accepted source
meaning.

Code, tests, schemas, telemetry, and repeated behavior can expose a likely
obligation, but the inference remains candidate until an applicable authority
accepts it. A passing or failing test is an evidence source or witness, not a
Requirement authority.

## 2. Distinguish inference from derivation

Use **inferred** for a candidate reconstructed from behavior, implementation,
tests, incidents, conventions, or stakeholder interpretation when no accepted
local obligation establishes it. Preserve the evidence and uncertainty; do not
write `derived_from` merely because the inference is plausible.

Use **derived** when the candidate obligation follows from a maintained parent
Requirement as Architecture allocates responsibility or adds necessary detail.
The parent remains authoritative for its obligation, while the child needs
independent acceptance because it is separately changeable or satisfiable.
Record `derived_from` in canonical metadata only after both the local
obligation and its relationship to the maintained parent are accepted.

An accepted ADR or architecture responsibility may source a candidate
Requirement without making it a parent Requirement.

## 3. Form one candidate obligation

State what a subject must do, achieve, preserve, prevent, or constrain under
the material conditions and bounds. Keep independently changeable or
satisfiable obligations separate. Classify the primary meaning as functional,
quality, process, human-factors, usability, or constraint, but do not let the
classification or chosen syntax imply acceptance.

Use any fitting specification method to expose ambiguity. Quantities, tables,
state models, invariants, schemas, formal expressions, examples, or external
normative references can help analyze the obligation; they do not create its
authority.

## 4. Choose and challenge the subject

Select one candidate eligible Architecture subject by asking which thing bears
the obligation at the level where it must remain true. Do not place it on the
code, test, Component, or document where the evidence happened to appear.

Apply the shared encounter, structural, replacement, scope, and authority
tests. In particular:

- choose a Surface when actor-facing behavior must hold across replacement
  implementations of that encounter point;
- choose a C4 element when the obligation intentionally binds that runtime or
  responsibility boundary;
- choose a Feature, Capability, or System when the obligation spans several
  encounter points or structural realizations and that broader subject truly
  owns the outcome; and
- revise candidate Architecture when no eligible subject owns the obligation
  coherently.

For an existing accepted Requirement with a questionable subject, propose a
reassignment and analyze downstream Architecture, derivation, realization, and
Evaluation impacts. Do not create a duplicate Requirement as a shortcut.

## 5. Verify and validate the candidate

Review whether the candidate is necessary, appropriate, unambiguous, complete,
singular, feasible, verifiable, correct relative to its source, and conforming
to the selected method. Review a bounded set for consistency, combined
feasibility, comprehensibility, and stated source coverage when several
candidates interact.

Use scenarios, prototypes, models, examples, and evaluation design to expose
missing conditions or infeasible responses. These improve the candidate but do
not ratify it.

## 6. Expose the decision and hand off

Record the candidate statement, source, candidate subject, type, inference or
derivation basis, alternatives, engineering findings, confidence, unknowns,
authority, recommendation, and blocking status. A Bugfix is blocked when no
accepted expectation can determine corrected behavior; a Defect Report can
usually proceed with the expectation gap explicit.

After the applicable authority accepts the obligation and its subject, use
[Documenting requirements](documenting-requirements.md) to assign its canonical
identity, represent it under the subject, preserve rationale and traceability,
and connect evidence.

## Final check

- A source concern or observed behavior did not become desired state by
  inference alone.
- Inference and derivation are distinguished, and `derived_from` is reserved
  for an accepted maintained parent relationship.
- The candidate states one obligation on one load-bearing eligible subject.
- Subject placement is not determined by failure, test, file, or current code
  location.
- Quality review and specification-method conformance do not imply acceptance.
- The required decision authority, recommendation, uncertainty, and blocking
  status are explicit.
