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
generated:
  by: claude/opus-5
  at: 2026-09-08T00:00:00Z
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

[^svpg-product-model-concepts]: SVPG — Product Model Concepts, which treats
    working to outcomes rather than output as a defining concept of the product
    model.
[^product-value-demand]: [Value and demand model](value-and-demand-model.md)
    distinguishes product meaning from the outcomes used to test it.
