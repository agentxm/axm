---
type: Reference
title: Classifying requirements
description: Uses project taxonomy when available and supplies a non-exclusive fallback lens for requirement analysis.
tags: [classification, functional, quality, constraint, conformance, human-factors, process]
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# Classifying requirements

Use the project's declared taxonomy when one exists. Map it to this portable
fallback lens only when that improves analysis or exchange:

| Lens | Focus |
| --- | --- |
| Functional behavior | Responses, transformations, rules, and observable capabilities |
| Quality | Measurable degrees such as performance, reliability, security, or maintainability |
| Constraint | A genuine restriction on solution, environment, technology, or operation |
| External conformance | Applicable obligations from a named law, standard, contract, or interface |
| Human factors and use context | Capabilities and qualities arising from users, tasks, accessibility, ergonomics, or context |
| Process and lifecycle | Obligations on development, deployment, operation, support, migration, or retirement |

These are analysis lenses, not necessarily exclusive issue types. A requirement
may need multiple tags, but its primary classification should reflect the
review expertise and quality criteria it most needs.

Classification does not determine priority, acceptance, subject, or verification
method. Avoid vague residual buckets such as “non-functional” when a more useful
quality or constraint meaning can be named.
