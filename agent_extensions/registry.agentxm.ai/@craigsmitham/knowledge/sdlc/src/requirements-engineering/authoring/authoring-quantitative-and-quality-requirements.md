---
type: Guide
title: Authoring quantitative and quality requirements
description: Specifies measurable quality obligations without inventing targets or omitting assessment context. Use when a requirement asserts a quality such as performance, reliability, or availability, or rests on an adjective with no measure, condition, or target.
tags: [quality, quantitative, measure, threshold, performance, reliability, requirements-engineering]
generated: { by: codex/gpt-6, at: 2026-11-22T01:50:08Z }
---

# Authoring quantitative and quality requirements

Start with the stakeholder's request and any decision that sets a target.
For a request such as “acknowledge imports promptly,” identify who waits and
which two events start and stop their wait. Define:

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

## Try the measure on a small set of observations

Suppose a partner has agreed that at least 95% of valid catalog uploads
received each day (UTC) must be acknowledged within ten minutes of receipt.
Decide which events your records can actually show. Here the confirmation
must reach the partner. A log that shows when a confirmation was queued
leaves its arrival unknown.

Take one day's cohort of 20 valid uploads. If 19 acknowledgements arrived
within ten minutes and one arrived late, 19/20 meets the target exactly.
Change one timely arrival to late and the result falls to 18/20. A delayed
upload that crosses midnight still belongs to its day of receipt. If an
arrival record is missing, identify what evidence would distinguish a late
arrival from a gap in measurement. Specify how missing observations are to
be handled or leave that decision open with the owner.
