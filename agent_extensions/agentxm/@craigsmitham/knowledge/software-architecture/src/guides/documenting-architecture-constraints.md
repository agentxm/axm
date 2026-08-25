---
type: Guide
title: Documenting constraint requirements
description: How to document one binding limitation on the permitted design, implementation, technology, interface, legal, policy, platform, or operating space of an architecture subject.
tags: [architecture-documentation, requirements, constraints, authority, design-space]
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

# Documenting constraint requirements

Use this guide when the primary accepted obligation narrows the permitted
design, implementation, technology, interface, legal, policy, platform, or
operating space of an architecture subject.

## 1. Confirm that the limit is binding

Follow [Documenting requirements](documenting-requirements.md). Identify:

- the architecture subject whose options are limited;
- the prohibited or mandated condition;
- the law, contract, policy, external system, platform, accepted decision, or
  higher-level requirement that supplies authority;
- the scope, exceptions, and consequence of violation; and
- the authority or event that can release, replace, or reconsider the limit.

Set `requirement_type: constraint` only when the limitation is accepted and
binding. A preference, assumption, current implementation property, tentative
decision, common practice, or convenient default is not a constraint.

## 2. Distinguish constraints from nearby claims

| Claim | Treatment |
| --- | --- |
| “The service currently uses PostgreSQL.” | Current realization evidence, unless continued use is independently mandated |
| “The team prefers PostgreSQL.” | Preference or decision input |
| “The accepted ADR chooses PostgreSQL.” | The ADR owns the choice and rationale; create a constraint only if the resulting limitation is independently binding |
| “Reservation data must remain in its processing region under the signed agreement.” | Constraint Requirement sourced by the agreement |
| “The service returns reservation status through its API.” | Functional interaction behavior |
| “The external partner accepts only protocol version 4.” | Constraint when that external compatibility boundary binds the subject |

An interface is not automatically a constraint. Required exchanged behavior is
usually `functional`; an interoperability outcome can be `quality`; a mandated
protocol, schema form, connector, or external interface technology is
`constraint`.

## 3. Draft the bounded limitation

Useful forms include:

> When `[scope or condition]`, `[subject]` shall use `[mandated option]`.

> When `[scope or condition]`, `[subject]` shall not `[prohibited option or
> outcome]`.

> For `[affected information, interaction, or operation]`, `[subject]` shall
> remain within `[binding boundary]`.

State one limitation and enough context to interpret it. Avoid smuggling a
preferred design into the statement by calling it a standard. If an external
authority is too detailed or restricted to reproduce, link or identify it and
state only the durable obligation needed by architecture readers.

## 4. Preserve authority and lifecycle

Use `requirement_sources` for a maintained source concept or public external
authority when appropriate. Explain in `## Rationale`:

- why the constraint binds the subject;
- what architecture options or responsibilities it affects;
- the consequence or risk it controls; and
- who or what can change, waive, or trigger review of it.

Do not claim that a contract, law, policy, or standard says more than the
available source establishes. Keep restricted material, legal interpretation,
and current compliance evidence with their authoritative owners.

## 5. Review necessity and design cost

Ask whether:

- the source has authority over the named subject and scope;
- the statement describes a genuine limit rather than its present realization;
- exceptions, jurisdictions, environments, and review conditions are clear;
- the constraint is stated at the highest appropriate abstraction level;
- the loss of design freedom and its tradeoffs have been understood; and
- credible evidence can distinguish compliance from violation without the
  Requirement prescribing the exact verification method.

## Example

Weak:

> The reservation system shall use regional storage.

Synthetic constraint Requirement:

> For reservation records and their backups, the Reservation system shall
> persist each record only within the processing region assigned by the
> governing data-processing agreement.

The signed agreement remains the authority, and legal review owns any release
or change. Current storage topology and compliance results remain evidence.

Do not create `Architecture Constraint`, `constraints/`, or `constraints.md`.
Colocate the Requirement under its subject's `requirements/constraint/`
folder.
