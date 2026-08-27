---
type: Guide
title: Designing Evaluation Protocols
description: Use when creating, revising, retiring, or organizing governed assessment contracts for Requirement satisfaction, Architecture realization, or Implementation conformance.
tags: [evaluations, protocols, requirements, architecture, implementation, cases, reporting]
status: draft
sources:
  - resource: evaluation-protocols-as-assessment-contracts.md
    title: Evaluation Protocols as assessment contracts
  - resource: ../profile/gen-stack-application-profile.md#evaluation-protocols
    title: Gen Stack application profile — Evaluation Protocols
  - resource: ../architecture/requirements/one-authority-many-witnesses.md
    title: One authority, many witnesses
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T22:58:31Z
---

# Designing Evaluation Protocols

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). The [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns the governed
> representation. This Guide supports action and adds neither semantic
> authority nor profile-conformance rules.

## Goal

Create one maintainable assessment contract whose role, criteria authority,
method, judgment, and evidence limits are explicit enough to compile into or
guide repository-native evaluation work.

## Representation

Use the profile's exact `Evaluation Protocol` type, role-specific path and
target field, identity and lifecycle fields, and four required second-level
headings. Keep Suites, executable Cases, harness bindings, Executions, Results,
and Reports in their repository-native formats. Link them by stable identities
instead of copying volatile run data into the Protocol.

## 1. Start from the authority, not the test tool

Choose the primary claim before choosing a method:

- use `requirement-satisfaction` when the claim is conformance to active
  Requirements;
- use `architecture-realization` when the claim is faithful realization of
  accepted Architecture meaning; or
- use `implementation-conformance` when the claim is a repository-local
  contract or invariant of one or more Implementation Units.

If one proposed Protocol mixes these claims, split it. Shared setup or one test
framework is a Suite concern, not a reason to merge authorities.

## 2. Select the narrowest coherent target

For Requirement satisfaction, reference stable Requirement IDs and derive the
Architecture subject from each Requirement. Prefer one Requirement per Protocol
unless several obligations form one indivisible judgment.

For Architecture realization, select the authority that owns the accepted
meaning. Choose the narrowest applicable Surface, Feature, Capability, Bounded
Context, Context Map, C4 element, ADR, or System. Never target a C4 View.

For Implementation conformance, identify repository-relative Unit paths that
resolve mechanically. State the local contract in the Protocol; do not imply
that repository layout is Architecture.

## 3. Write the bounded claim

In `## Claim`, state:

- the realized subject or Unit being assessed;
- the authoritative obligation, accepted Architecture meaning, or local
  contract;
- the material conditions in which it applies; and
- material exclusions that prevent overclaiming.

Repeat an authoritative predicate only as needed to make the assessment
operable. Link to its owner and resolve any disagreement at that owner.

## 4. Design the assessment

In `## Assessment`, choose evidence whose strengths and blind spots fit the
claim and consequence. Describe the method, observation points, Cases or
sampling, inputs and fixtures, environment, and relevant independence.

Cases may be inline scenarios, linked stable source, or repository-native test
vectors. Keep them under one Protocol when they share its claim, role, targets,
judgment, and lifecycle. Promote a Case when any of those must vary
independently.

For an EARS-shaped Requirement, preserve the mapping without treating syntax
as executable specification:

| Requirement element | Protocol concern |
| --- | --- |
| Optional feature | Applicable configuration or variant |
| Continuing state | Setup and maintained preconditions |
| Trigger | Stimulus, event, or sampled condition |
| Obligated subject | Derived Architecture subject |
| Required response | Observable outcome and judgment criterion |
| Bound | Threshold, tolerance, population, or observation window |

## 5. Make judgment explicit

In `## Judgment`, define:

- observations or measurements required;
- oracle, review procedure, or comparison;
- thresholds and tolerances;
- conditions for `pass` and `fail`; and
- conditions that preserve `unknown`, including missing or contradictory
  evidence.

Keep `harness-error` as evidence state rather than converting it into target
failure. Do not let skipped, missing, or stale evidence roll up as a pass.

## 6. Bind evidence and lifecycle

In `## Evidence and lifecycle`, name the repository-native source and result
routes, expected refresh triggers, stewardship route, known limitations, and
retirement conditions. Every Execution should bind:

- exact Protocol revision and selected Cases or sample;
- material inputs or observations;
- environment and configuration;
- exact Implementation revision;
- evaluator, runner, harness, or human role; and
- attempt time or observation window.

Retire a Protocol when its claim is no longer applicable or its authority is
retired. Preserve identity, last applicable targets, and retirement
Provenance. Replace it rather than silently reusing its ID for a new claim.

## 7. Organize Suites and reports as projections

Suites may mirror `requirements/`, `architecture/`, and `implementation/` when
that improves navigation and maintenance, but they need not do so. One Suite
may group Protocols across subjects; one Protocol may be realized by several
repository-native checks.

Report Requirement satisfaction, Architecture realization, and Implementation
conformance separately. Within each role, show Protocol Coverage, evidence
state, and bounded outcome as independent axes. Preserve Protocol, Case,
Execution, Result, revision, environment, and time/window traceability.

When a harness consumes the Gen Stack CLI, let it use policy-neutral candidates
as orientation and bind through `protocol_id` plus the exact Protocol revision.
Do not encode one harness's selection policy, Suite layout, annotations, or
adapter contract in the governed Protocol merely to make that integration
convenient.

## 8. Validate without overstating the result

Run OKF and profile validation, then perform a named semantic review. Structural
validation can establish identity, path, role, target form and resolution,
lifecycle, and required sections. It cannot establish coverage, method
adequacy, evidence currency, passing outcomes, satisfaction, realization,
conformance, assurance, or fitness.

## Final check

- The Protocol owns one bounded claim and one role.
- The target field matches the role and the target resolves.
- Requirement subjects are derived, not duplicated.
- The assessment and judgment can produce `pass`, `fail`, or `unknown`.
- Cases inherit the Protocol or are promoted when they need independence.
- Execution provenance and refresh conditions are explicit.
- Reporting keeps roles and the three axes separate.

## Related

- [Evaluation Protocols as assessment contracts](evaluation-protocols-as-assessment-contracts.md)
- [Deriving evaluation coverage in harnesses](deriving-evaluation-coverage-in-harnesses.md)
- [Pet Store evaluation protocol example](pet-store-evaluation-protocol-example.md)
- [Designing evaluations for Surfaces](designing-evaluations-for-surfaces.md)
- [Designing evaluations for C4 structure](designing-evaluations-for-c4-structure.md)
