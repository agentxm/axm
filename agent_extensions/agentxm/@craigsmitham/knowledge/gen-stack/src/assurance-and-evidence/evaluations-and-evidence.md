---
type: Explanation
title: Evaluations and evidence
description: How evaluation definitions, executions, results, promoted evidence, and governance decisions relate to authoritative Requirements.
tags: [evaluations, evidence, tests, requirements, assurance, observations]
---

# Evaluations and evidence

An evaluation is not one artifact. Keep these identities distinct:

| Identity | Meaning |
| --- | --- |
| Evaluation definition | What is assessed, under which conditions, by which method and oracle |
| Execution | One bounded attempt using identified inputs, environment, implementation, and evaluator |
| Result | The observations and assertion outcomes produced by that execution |
| Promoted evidence | A deliberately retained result or aggregate bound to a named decision |
| Governance decision | The human or institutional judgment made using available evidence |

An evaluation definition that claims Requirement coverage should reference the
stable `requirement_id`. It may repeat the Requirement's predicate exactly,
because executable assessment and normative intent have different jobs. The
Requirement does not need volatile backlinks to every run; generated coverage
views can resolve references in the direction that changes more often.

Preserve `unknown`, evaluator failure, insufficient evidence, and conflicting
results. A passing check establishes no more than its method, environment, and
oracle support. A failing check may indicate implementation non-satisfaction,
a stale or faulty evaluator, an ambiguous or obsolete Requirement, or a shared
misinterpretation. Classification precedes correction.

Use multiple evaluations when their methods expose meaningfully different
blind spots. Redundant witnesses strengthen confidence only when they are not
all downstream of the same unchecked interpretation.
