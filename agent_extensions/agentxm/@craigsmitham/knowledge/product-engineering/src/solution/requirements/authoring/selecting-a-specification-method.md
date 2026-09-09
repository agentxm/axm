---
type: Guide
title: Selecting a requirement specification method
description: Selects a specification form proportional to ambiguity, consequence, interaction complexity, and assurance need. Use when prose is leaving an obligation ambiguous, or when choosing among structured syntax, examples, models, and formal notation.
tags: [specification-method, prose, ears, examples, model, formal-method, pe-solution]
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Selecting a requirement specification method

Choose the lightest form that makes the obligation precise enough for its
consequence and uncertainty.

| Need | Useful forms |
| --- | --- |
| Simple observable obligation | Controlled natural language or structured prose |
| Conditional or unwanted behavior | EARS-like condition-response syntax |
| Many rule combinations | Decision table or example table |
| User interaction and alternatives | Scenario, use case, journey, or prototype |
| Stateful or temporal behavior | State model, sequence, temporal rule, or invariant |
| Data relationships and limits | Schema, data model, table, or mathematical expression |
| High consequence or proof obligation | Formal notation plus defined analysis |

Text and model should complement one another. Name the authoritative element
when several representations overlap, and link examples as clarification or
tests rather than letting them silently redefine the requirement.

Do not force every requirement into one syntax. A structured sentence improves
clarity only if it preserves the actual conditions, subject, and outcome.

Some obligations need a form that people outside the authoring team can read and
that fails automatically when the system stops honoring it. That form is an
executable specification, and [How to build
it](../../../engineering/designing-executable-specifications.md) owns which
accepted rules earn one, what its text may contain, and how automation binds
beneath it; [Keeping specifications
authoritative](../../../engineering/keeping-specifications-authoritative.md)
owns how it stays trustworthy afterward. Choosing the form is a requirements
decision. Admitting and writing the executable statement is an engineering one,
and the requirement record stays authoritative over the rule unless the project
has declared the specification text to be the requirement.
