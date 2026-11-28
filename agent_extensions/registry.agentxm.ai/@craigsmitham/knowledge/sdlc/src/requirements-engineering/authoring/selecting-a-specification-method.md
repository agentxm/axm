---
type: Guide
title: Selecting a requirement specification method
description: Selects a specification form proportional to ambiguity, consequence, interaction complexity, and assurance need. Use when prose is leaving an obligation ambiguous, or when choosing among structured syntax, examples, models, and formal notation.
tags: [specification-method, prose, ears, examples, model, formal-method, requirements-engineering]
generated: { by: codex/gpt-6, at: 2026-11-22T02:01:18Z }
---

# Selecting a requirement specification method

Take the obligation you are trying to agree on and a case on which readers
could disagree. Identify what determines the outcome in that case. Choose
the lightest form below that lets the people making the decision express
and inspect that distinction.

| Need | Useful forms |
| --- | --- |
| Simple observable obligation | Controlled natural language or structured prose |
| Conditional or unwanted behavior | State the condition and required response in order. [EARS](../foundations/easy-approach-to-requirements-syntax.md) provides one syntax for this. |
| Many rule combinations | Decision table or example table |
| User interaction and alternatives | Scenario, use case, journey, or prototype |
| Stateful or temporal behavior | State model, sequence, temporal rule, or invariant |
| Data relationships and limits | Schema, data model, table, or mathematical expression |
| High consequence or proof obligation | Formal notation plus defined analysis |

Text and model should complement one another. Name the authoritative element
when several representations overlap, and link examples as clarification or
tests rather than letting them silently redefine the requirement.

Try the chosen form on that case. For example, suppose a dispatcher's
permission to reassign a machine depends on both the booking state and who
owns the machine. Sketch the combinations in a decision table. Can a reader
determine the result for a confirmed booking on a partner-owned machine?
If the agreement leaves that cell open, mark the decision for the person
who can settle it. If ownership makes no difference and one sentence covers
every agreed case, keep the sentence. Check the subject, conditions, and
outcome against the source obligation before adopting the form.

If reviewers need to read the rule and see when the system violates it,
consider an executable specification. Agree on the authoritative text first.
The requirement record governs the rule unless the project explicitly gives
the specification text that authority. For readable examples, automation
bindings, and evidence from each run, see the optional *Executable
specifications* pattern at
[Executable specifications](../../software-testing/patterns/executable-specifications.md).
