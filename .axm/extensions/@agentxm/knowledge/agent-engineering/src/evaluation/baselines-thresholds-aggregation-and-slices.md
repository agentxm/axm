---
type: Reference
title: Baselines, thresholds, aggregation, and slices
description: Makes comparisons and dispositions without allowing aggregate scores to hide critical failures.
tags: [baselines, thresholds, aggregation, cohorts, slices, tradeoffs]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: openai-evals
    resource: https://developers.openai.com/api/docs/guides/evaluation-best-practices
    title: OpenAI — Evaluation best practices
  - id: nist-rmf
    resource: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
    title: NIST — AI RMF Core
---

# Baselines, thresholds, aggregation, and slices

Prefer a decision-relevant comparison: current production, the accepted prior
revision, the same task without the intervention, the simplest viable system,
or a named alternative. Hold unrelated variables constant when attributing a
difference.

Define thresholds before candidate results. Tie them to product requirements,
risk tolerance, uncertainty, and the cost of false acceptance or rejection.
Track quality with latency, cost, authority, safety, and reliability rather
than optimizing one convenience score.

Aggregate only after preserving:

- per-case and per-trial evidence;
- critical dimensions that require independent gates;
- meaningful slices such as task family, user population, language, risk tier,
  host, model, or failure mode; and
- grader disagreements and untested claims.

OpenAI warns that generic aggregate metrics and unrepresentative datasets can
misstate application performance.[^openai-evals] NIST requires context-specific
measurement and documented tradeoffs to support management decisions.[^nist-rmf]

An average improvement cannot compensate for a newly unsafe cohort unless the
accepted policy explicitly permits that tradeoff.

[^openai-evals]: OpenAI — Evaluation best practices

[^nist-rmf]: NIST — AI RMF Core
