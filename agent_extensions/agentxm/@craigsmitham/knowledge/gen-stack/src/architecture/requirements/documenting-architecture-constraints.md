---
type: Guide
title: Documenting constraint requirements
description: Use when an accepted architecture subject must be limited to a permitted design, implementation, technology, interface, legal, policy, platform, or operating space; document one binding constraint Requirement.
tags: [architecture-documentation, requirements, constraints, authority, design-space]
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
  - id: external-conformance
    resource: specifying-external-conformance-requirements.md
    title: Specifying external-conformance requirements
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 — Requirements engineering
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:12:18Z
---

# Documenting constraint requirements

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when the primary accepted obligation narrows the permitted
design, implementation, technology, interface, legal, policy, platform, or
operating space of an architecture subject.

## Representation

Inherit the native OKF and profile representation from [Documenting
requirements](documenting-requirements.md) and use
`requirement_type: constraint` as the single type representation. In the
canonical expression, prefer this logical order: authority and applicability,
obligated subject, mandated or prohibited condition, scope and exceptions,
consequence, and release or reconsideration trigger. Link accepted decisions
or external authorities rather than copying them as parallel constraints.

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

Use [Selecting a requirement specification
method](selecting-a-requirement-specification-method.md). EARS is useful when
the constraint's applicability maps accurately to its clauses. `Where`
means that an optional feature is included, not merely that a legal,
jurisdictional, or configuration condition exists. Use `While` for a
continuing operating state and `When` or `If…then` only for a discrete desired
or unwanted trigger.

An unconditional constraint can use the ubiquitous EARS form:

> `[subject]` shall use `[mandated option]`.

A state-qualified constraint can apply the state-driven form:

> While `[operating state]`, `[subject]` shall not `[prohibited option or
> outcome]`.

When an authoritative scope such as a jurisdiction or information class does
not map cleanly to EARS, retain a bounded non-EARS formulation rather than
mislabeling the scope as an optional feature or event:

> For `[affected information, interaction, or operation]`, `[subject]` shall
> remain within `[binding boundary]`.

For conformance to a standard, schema, or profile, follow [Specifying
external-conformance requirements](specifying-external-conformance-requirements.md)
so the exact target, version, class, scope, deviations, and authority roles
remain clear.

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
