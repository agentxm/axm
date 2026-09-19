---
type: Explanation
title: Verification and validation
description: Distinguishes specification-quality and realization checks from validation of stakeholder need and intended use.
tags: [verification, validation, evidence, stakeholder, intended-use, pe-solution]
generated: { by: codex/gpt-6, at: 2026-09-09T15:53:30Z }
---

# Verification and validation

**Verification** asks whether a requirement is well formed and whether a
specified realization satisfies it. **Validation** asks whether the requirement
and realized outcome address the right stakeholder need in the intended
context.

Both operate throughout the lifecycle:

- early verification reviews clarity, consistency, singularity, feasibility,
  and assessability;
- early validation uses stakeholder review, examples, prototypes, models, and
  experiments to challenge the proposed obligation;
- realization verification uses tests, analysis, inspection, demonstration, or
  other declared assessment methods;
- outcome validation observes whether the delivered behavior is useful and
  acceptable in practice.

Passing a test does not prove that the requirement was the right one. Stakeholder
agreement does not prove that a realization satisfies the accepted wording.
Record each claim with its target, revision, context, method, result, and limits.

Where a work item is the record that carries a change, [Defining work-item
verification](../../../delivery/work-items/common/defining-verification.md)
applies this distinction to that record: stating observable completion
conditions, choosing an evidence strategy, and keeping a bounded result
separate from closure. It specializes this concept rather than restating it,
and neither treats a recorded result as authority over the requirement itself.

For the connection between delivered behavior and customer or business results,
read [Outcomes and evidence](../../../problem/outcomes-and-evidence.md). It
examines the causal assumptions and observations behind outcome claims. The
[behavior and commitment route](../../../reading-product-engineering.md#behavior-and-commitment)
places those claims alongside actor goals, requirements, and executable evidence.
