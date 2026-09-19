---
type: Explanation
title: Outcomes and evidence
description: How product outcomes connect shipped output to changes in customer behavior and business results, and what evidence supports that connection.
tags: [outcomes, outputs, evidence, product-metrics, customer-value, pe-problem]
status: draft
sources:
  - id: svpg-product-model-concepts
    resource: https://www.svpg.com/product-model-concepts/
    title: SVPG — Product Model Concepts
  - id: product-value-demand
    resource: value-and-demand-model.md
    title: What to solve — Value and demand model
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Outcomes and evidence

An output is something the team produces: a release, feature, experiment, or
document. An outcome is a consequential change in customer behavior, customer
condition, or organizational result. Product work uses outputs to pursue
outcomes, but shipping does not prove the outcome
occurred.[^svpg-product-model-concepts]

A useful outcome is:

- connected to customer and organizational value;
- observable within a decision-relevant period;
- specific enough to guide tradeoffs; and
- open to more than one possible solution.

A value proposition states why an audience should expect an offering to help
with a need or job. An outcome states the consequential change expected in
customer behavior, customer condition, or organizational result. Connecting
the two makes the value hypothesis testable without treating them as the same
thing.[^product-value-demand]

Evidence forms a chain rather than one decisive metric. Interviews and
observations can establish a problem; prototypes can test comprehension or
choice; technical investigation can test feasibility; and production use can
show whether the expected behavior and benefit occurred. Each answers a
different question.

Measures are proxies for outcomes, not the outcomes themselves. A target can be
gamed or improved without creating value. Use several signals when one measure
would hide important tradeoffs, and keep the causal assumptions between output,
behavior, and result explicit.

An outcome focus does not mean teams ignore delivery. Reliable output is
necessary to create value; it is simply insufficient evidence that value was
created.

## Northbank: follow the claim through the evidence

[Northbank Equipment](../northbank-equipment.md) hypothesizes that dependable
fulfillment will reduce disruption and encourage repeat rental. Its later
allocation and engineering-system changes produce different evidence:

| Observation | Claim it can inform | Question still open |
| --- | --- | --- |
| Policy/concurrency assessment passes in a declared environment | The implementation honors the selected allocation rules there | Whether the rules and operating scope fit customer needs |
| The identified artifact is deployed and its smoke assessment passes | The bounded deployed path works at that observation | Long-term service quality and fulfillment |
| Confirmation KPI changes from 82% to 89% under a stable definition | A later two-depot confirmation measure improved | Cohort effects, withdrawals, actual fulfillment, and causality |
| Contractors report fewer disrupted starts alongside fulfillment records | The service may have improved their situation | Representativeness and the intervention's contribution |
| Repeat use and margin change | Business outcomes may have changed | Competing explanations and whether the economics endure |

The table is an evidence structure, not a record of real results. A faster CI
pipeline or fewer custom scripts is an engineering-system observation; its
connection to customer benefit needs an explicit mechanism and further evidence.
[KPIs](../foundations/key-performance-indicators.md) preserves the measure's
definition, while [verification and validation](../solution/requirements/foundations/verification-and-validation.md)
separates conformance from fitness for purpose.

## Continue exploring

- [Key performance indicators](../foundations/key-performance-indicators.md)
  explains how measures, targets, and decision roles turn outcome questions into
  interpretable performance evidence.
- [Marty Cagan's product strategy](../foundations/cagan-product-strategy.md#management-sustain-progress-and-revise-understanding)
  connects observed results back to team focus and strategic revision.
- [Verification and validation](../solution/requirements/foundations/verification-and-validation.md)
  distinguishes evidence of conformance from evidence that a solution serves its purpose.
- Follow [Value and evidence](../reading-product-engineering.md#value-and-evidence)
  to revisit the customer and economic claims behind an expected result.

[^svpg-product-model-concepts]: SVPG — Product Model Concepts, which treats
    working to outcomes rather than output as a defining concept of the product
    model.
[^product-value-demand]: [Value and demand model](value-and-demand-model.md)
    distinguishes product meaning from the outcomes used to test it.
