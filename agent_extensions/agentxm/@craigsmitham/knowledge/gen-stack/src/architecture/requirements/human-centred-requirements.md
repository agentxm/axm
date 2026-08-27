---
type: Explanation
title: Human-centred requirements in software architecture
description: How usability and human-factors requirements overlap while preserving different primary outcomes, contexts, evidence, and architecture consequences.
tags: [requirements-engineering, human-centred-design, usability, human-factors, context-of-use]
status: draft
sources:
  - id: iso-9241-11
    resource: https://www.iso.org/standard/63500.html
    title: ISO 9241-11:2018 — Usability definitions and concepts
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 — Requirements engineering
  - id: requirement-classification
    resource: requirement-classification.md
    title: Classifying requirements in software architecture
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:12:18Z
---

# Human-centred requirements in software architecture

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

Human-centred requirements describe accepted outcomes at the relationship
between people and a system. The profile keeps `usability` and
`human-factors` as separate primary types because they lead authors to ask
different questions, even though one concern can involve both.

## The primary distinction

| Type | Primary focus | Context that must be understood |
| --- | --- | --- |
| `usability` | Outcomes of use: whether specified users achieve specified goals effectively, efficiently, satisfactorily, or with another accepted interaction outcome | Users, goals, tasks, resources, and physical, social, technical, and organizational environment |
| `human-factors` | Fit between the human and system: capabilities, limitations, workload, cognition, health, safety, well-being, and allocation of action or authority | Human characteristics, operating conditions, workload, hazards, environment, training or skill assumptions, and system role |

ISO 9241-11 treats usability as an outcome of use and makes context of use
essential to interpreting it.[^iso-9241-11] ISO/IEC/IEEE 29148 discusses a
broader human-system-integration concern that includes human capabilities,
limitations, safety, workload, performance, and well-being.[^iso-29148]

Examples clarify the difference:

- “During incident triage, an on-call engineer shall identify the affected
  region without consulting another tool” is primarily `usability` because it
  concerns a specified user's goal and interaction outcome.
- “During a four-hour monitoring period, the console shall not require one
  operator to acknowledge more simultaneous critical alarms than the accepted
  workload limit” is primarily `human-factors` because it constrains cognitive
  workload and safe human performance.

Both still need accepted sources, an eligible architecture subject, and
credible future evidence.

## Do not classify by stakeholder vocabulary

Words such as *easy*, *intuitive*, *safe*, *accessible*, and *user-friendly*
identify concerns, not requirements or types. Determine:

- which users or human roles are in scope;
- what goals, tasks, responsibilities, or hazards matter;
- which capabilities, limitations, environments, or resources affect the
  outcome;
- what observable outcome is accepted; and
- whether the obligation is primarily an outcome of interaction, a broader
  human-system condition, a system quality, or a binding legal or design
  limitation.

Accessibility illustrates the overlap. An outcome enabling specified users to
complete a task can be `usability`; accommodation of a human capability or
limitation can be `human-factors`; a quality-model target can be `quality`; and
a mandated conformance level can be `constraint`. Several independently
accepted obligations may be justified, but one vague accessibility statement
should not be multiplied into four records.

## Context is part of the meaning

Human-centred outcomes do not generalize safely from an unspecified “user.” A
useful requirement identifies or links the material context:

- user or operator group and relevant characteristics;
- goal, task, or responsibility;
- physical, social, organizational, and technical environment;
- tools, information, training, time, and other resources;
- expected frequency, duration, workload, stress, or hazard conditions; and
- exclusions or populations for which another requirement applies.

Put stable accepted context in the Requirement or a durable source concept.
Keep research participants, private records, tentative findings, test scripts,
and current measured results with their proper authorities.

## Architecture significance

A human-centred requirement belongs in the Gen Stack corpus when its
satisfaction materially shapes durable subjects, responsibilities,
boundaries, interaction surfaces, information availability, control
allocation, failure handling, deployment environment, or assurance. A minor
copy preference or transient research hypothesis usually does not pass that
admission test.

The architecture response explains how the system assigns responsibility and
supports the outcome. It does not repeat the binding statement. Evidence can
come from inspection, analysis, simulation, usability evaluation, controlled
study, operational observation, or several methods; the Requirement does not
need to freeze that strategy.

Use [Documenting usability
requirements](/architecture/requirements/documenting-usability-requirements.md) when an outcome
of use is primary. Use [Documenting human-factors
requirements](/architecture/requirements/documenting-human-factors-requirements.md) when human
capabilities, limitations, workload, safety, health, or environment are
primary.

[^iso-9241-11]: ISO 9241-11:2018 supplies the usability and context-of-use
    concepts adapted here; it does not prescribe a particular evaluation
    method.
[^iso-29148]: ISO/IEC/IEEE 29148:2018 supplies the broader human-factors and
    human-system-integration considerations adapted here.
