---
type: Guide
title: Selecting a requirement specification method
description: Selects a specification form proportional to ambiguity, consequence, interaction complexity, and assurance need.
tags: [specification-method, prose, ears, examples, model, formal-method]
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
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
