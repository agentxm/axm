---
type: Guide
title: Documenting usability requirements
description: Use when an accepted outcome of use must be stated for specified users, goals, tasks, resources, and context; document one usability Requirement without prescribing an evaluation method.
tags: [architecture-documentation, requirements, usability, context-of-use, human-centred-design]
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
  - id: iso-9241-11
    resource: https://www.iso.org/standard/63500.html
    title: ISO 9241-11:2018 — Usability definitions and concepts
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:12:18Z
---

# Documenting usability requirements

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when the primary accepted obligation is an outcome of use:
specified users achieving specified goals with required effectiveness,
efficiency, satisfaction, learnability, error recovery, or another defined
interaction outcome in a context of use.[^iso-9241-11]

## Representation

Inherit the native OKF and profile representation from [Documenting
requirements](documenting-requirements.md) and use
`requirement_type: usability` as the single type representation. In the
canonical expression, prefer this logical order: specified users and context,
goal and task, obligated Surface or other subject, required interaction
outcome, criterion or tolerance, and material exclusions. Link the evaluation
method instead of turning it into a second obligation.

## 1. Define the context of use

Follow [Documenting requirements](documenting-requirements.md), then identify
or link:

- the user or actor group and relevant characteristics;
- the goal and task, including material frequency or complexity;
- the product, system, service, or interaction surface being used;
- the physical, social, organizational, and technical environment;
- available information, tools, training, time, and other resources; and
- the accepted outcome and any necessary criterion or tolerance.

A percentage, completion time, rating, or error limit is uninterpretable when
the user population, task, and context are absent. Do not manufacture a target
from an industry norm without accepted source and feasibility evidence.

## 2. Confirm usability is primary

Set `requirement_type: usability` when an outcome of interaction in context is
the main obligation. Choose `human-factors` when workload, cognition, human
limitations, safety, health, or environmental fit is primary. A mandated
accessibility standard or interaction technology may instead be a
`constraint`; a broader quality-model outcome may be `quality`.

Use [Human-centred requirements in software
architecture](/architecture/requirements/human-centred-requirements.md) when the boundary is
unclear.

## 3. Draft the outcome of use

Use [Selecting a requirement specification
method](selecting-a-requirement-specification-method.md). EARS may separate a
continuing context from an interaction trigger; a context-of-use scenario,
task model, quantitative criterion, or incorporated accessibility standard may
better preserve other meaning. Keep users, task, and context visible. One
natural-language response form is:

> `[subject]` shall enable `[specified users]` to achieve `[accepted
> effectiveness, efficiency, satisfaction, learnability, or recovery outcome]`
> `[within accepted bounds]`.

Write the desired outcome, not the evaluation protocol. The Requirement can
include an accepted measure or criterion while leaving participant sampling,
moderation, instrumentation, calculation, and current results to an evaluation
authority.

Avoid *easy*, *intuitive*, *user-friendly*, or *few clicks* unless the term is
defined and justified. A UI mechanism is not automatically a usability
outcome, and minimizing interaction count can harm comprehension or safety.

## 4. Review coverage and evidence

Ask whether:

- users, goals, tasks, resources, and material environment are sufficiently
  bounded;
- the requirement states an outcome for use rather than a preferred design;
- the criterion reflects the source need and does not exclude a material user
  population accidentally;
- accessibility and human-factors concerns have been split only when they are
  independently accepted; and
- credible evaluation could distinguish satisfaction from failure without the
  Requirement prescribing the exact method.

## Example

Weak:

> The incident console shall be intuitive.

Synthetic usability Requirement:

> While an incident is active, when an on-call engineer familiar with the
> incident process attempts to identify the affected production region, the
> incident console shall enable the engineer to identify the region without
> consulting another system.

A real requirement may also need an accepted time, error, or satisfaction
criterion. The synthetic example deliberately does not invent one.

[^iso-9241-11]: ISO 9241-11:2018 treats usability as an outcome of use and
    supplies the context-of-use concepts adapted by this guide.
