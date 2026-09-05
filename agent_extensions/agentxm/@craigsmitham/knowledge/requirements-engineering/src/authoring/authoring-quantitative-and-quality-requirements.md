---
type: Guide
title: Authoring quantitative and quality requirements
description: Specifies measurable quality obligations without inventing targets or omitting assessment context.
tags: [quality, quantitative, measure, threshold, performance, reliability]
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# Authoring quantitative and quality requirements

A quality requirement needs more than an adjective. Define:

- the obligated subject and quality characteristic;
- operating conditions, workload, population, data, and environment;
- measure, unit, aggregation, observation window, and exclusions;
- target, threshold, distribution, or tolerance;
- assessment method and evidence retention needs.

For example, latency may require an endpoint set, load model, percentile,
sampling interval, warm-up policy, measurement point, and maximum value.
Availability may require service boundary, counted downtime, maintenance rules,
window, and calculation method.

If a needed target is unknown, do not invent a plausible number. Write a
candidate with an explicit decision placeholder, identify the evidence needed
to choose it, and avoid claiming verifiability until the target is resolved.

Balance qualities explicitly. Improving throughput may affect consistency,
cost, energy use, operability, or accessibility; the requirement set should
make accepted tradeoffs discoverable.
