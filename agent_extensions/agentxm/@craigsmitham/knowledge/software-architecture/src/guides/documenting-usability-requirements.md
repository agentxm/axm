---
type: Guide
title: Documenting usability requirements
description: How to document one accepted outcome of use for specified users, goals, tasks, resources, and context without prescribing an evaluation method.
tags: [architecture-documentation, requirements, usability, context-of-use, human-centred-design]
status: draft
sources:
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
  - id: human-centred-requirements
    resource: ../foundations/human-centred-requirements.md
    title: Human-centred requirements in software architecture
  - id: iso-9241-11
    resource: https://www.iso.org/standard/63500.html
    title: ISO 9241-11:2018 — Usability definitions and concepts
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:47:49Z
---

# Documenting usability requirements

Use this guide when the primary accepted obligation is an outcome of use:
specified users achieving specified goals with required effectiveness,
efficiency, satisfaction, learnability, error recovery, or another defined
interaction outcome in a context of use.[^iso-9241-11]

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
architecture](../foundations/human-centred-requirements.md) when the boundary is
unclear.

## 3. Draft the outcome of use

> When `[specified users]` perform `[task]` under `[material context]`,
> `[subject]` shall enable `[accepted effectiveness, efficiency, satisfaction,
> learnability, or recovery outcome]` `[within accepted bounds]`.

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

> During an active incident, an on-call engineer familiar with the incident
> process shall identify the affected production region from the incident
> console without consulting another system.

A real requirement may also need an accepted time, error, or satisfaction
criterion. The synthetic example deliberately does not invent one.

[^iso-9241-11]: ISO 9241-11:2018 treats usability as an outcome of use and
    supplies the context-of-use concepts adapted by this guide.
