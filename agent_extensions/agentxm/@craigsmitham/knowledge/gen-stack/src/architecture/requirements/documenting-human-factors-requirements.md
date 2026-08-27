---
type: Guide
title: Documenting human-factors requirements
description: Use when an accepted obligation arises from human capabilities, limitations, workload, safety, health, cognition, or operating environment; document one human-factors Requirement.
tags: [architecture-documentation, requirements, human-factors, human-system-integration, workload, safety]
status: draft
sources:
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
  - id: human-centred-requirements
    resource: /architecture/requirements/human-centred-requirements.md
    title: Human-centred requirements in software architecture
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

# Documenting human-factors requirements

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when the primary obligation arises from human capabilities,
limitations, workload, cognition, safety, health, well-being, or the physical
or organizational environment of human-system operation.

## Representation

Inherit the native OKF and profile representation from [Documenting
requirements](documenting-requirements.md) and use
`requirement_type: human-factors` as the single type representation. In the
canonical expression, prefer this logical order: human role and context,
task or responsibility, relevant capability or limitation, obligated subject,
required accommodation or system behavior, and accepted outcome or limit.
Keep private research and participant data with their own authority.

## 1. Establish the human-system context

Follow [Documenting requirements](documenting-requirements.md), then identify:

- the human role or population and relevant characteristics;
- the task, responsibility, control, or decision in scope;
- expected workload, frequency, duration, stress, hazard, and environment;
- the system behavior, allocation, information, or accommodation needed; and
- the accepted human outcome or limit.

Do not infer a universal “user.” Link stable contextual evidence and keep
private participant records or tentative research findings outside the public
Gen Stack corpus.

## 2. Confirm the primary type

Set `requirement_type: human-factors` when the central concern is fit between
the human and system. Use `usability` when the central outcome is specified
users achieving specified goals through interaction in a context of use. Use
`quality` for a broader assessable system-quality outcome and `constraint` for
a mandated design or legal limit.

The [human-centred requirements
foundation](/architecture/requirements/human-centred-requirements.md) gives the full
boundary and accessibility examples.

## 3. Draft an observable human-system obligation

Use [Selecting a requirement specification
method](selecting-a-requirement-specification-method.md). EARS can expose an
operating state, event, or unwanted condition; workload models, task or state
models, simulation, and incorporated human-factors standards can make other
semantic difficulties clearer. One natural-language response form is:

> `[subject]` shall `[human-system outcome or protection]` `[within an accepted
> human limit]`.

Name the observable system-side obligation while preserving the human outcome
that justifies it. Avoid claims that a system can directly guarantee an
uncontrolled internal human state. Replace “shall not confuse operators” with
an observable information, control, workload, or error-recovery outcome.

## 4. Review assumptions and architecture consequences

Ask whether:

- user characteristics, training, environment, workload, and hazard
  assumptions are explicit and supported;
- the outcome protects or accommodates people rather than merely optimizing a
  screen;
- the required system responsibility and any human responsibility are not
  conflated;
- a credible analysis, simulation, study, inspection, or operational
  observation could distinguish satisfaction from failure; and
- architecture consequences such as control allocation, information
  availability, failure handling, or deployment environment are linked without
  restating the obligation.

## Example

Weak:

> The alarm console shall avoid operator overload.

Synthetic human-factors Requirement:

> If more than the accepted critical-alarm workload arrives during one
> operator's monitoring interval, then the alarm console shall present
> correlated alarms as groups.

The actual workload bound and correlation authority must come from accepted
human-factors evidence; they must not be invented to make the example appear
precise. Preserving unacknowledged critical conditions is a separate
Requirement when that outcome is independently accepted and satisfiable.
