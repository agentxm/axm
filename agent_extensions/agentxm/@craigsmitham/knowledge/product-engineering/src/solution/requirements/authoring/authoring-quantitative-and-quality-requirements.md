---
type: Guide
title: Authoring quantitative and quality requirements
description: Specifies measurable quality obligations without inventing targets or omitting assessment context. Use when a requirement asserts a quality such as performance, reliability, or availability, or rests on an adjective with no measure, condition, or target.
tags: [quality, quantitative, measure, threshold, performance, reliability, pe-solution]
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
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

For a worked service-quality example, read
[SLIs, SLOs, and SLAs](../../../foundations/service-level-indicators-objectives-and-agreements.md#define-the-events-before-counting-them).
It develops event eligibility, measurement locations, windows, and the distinction
between a measured indicator, an objective, and an agreement.
[Key performance indicators](../../../foundations/key-performance-indicators.md)
explains why a measure is selected for attention; selection does not by itself
make its target an accepted requirement.

## Keep the case population with the target

The [Northbank case](../../../northbank-equipment.md#what-the-numbers-establish)
keeps the later two-depot confirmation KPI separate from the controlled
one-depot pilot and the confirmation-read arithmetic exhibit. Copying only a
percentage would lose the obligated subject, population, window, and evidence.
A new partner-recovery timeout remains an explicit candidate until its meaning
and authority are resolved.
