---
type: How-to guide
title: How to evaluate production behavior and detect drift
description: Connects offline evaluation with monitoring, feedback, experiments, incidents, and changing deployment conditions.
tags: [production-evaluation, monitoring, drift, user-feedback, ab-testing, incidents]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: nist-rmf
    resource: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
    title: NIST — AI RMF Core
---

# How to evaluate production behavior and detect drift

Offline evaluations provide controlled, repeatable evidence before user impact.
They cannot prove that the represented distribution remains current.

1. Instrument production to capture attributable target identity, outcomes,
   failures, costs, and privacy-safe traces.
2. Monitor product and risk signals by meaningful cohort.
3. Review user feedback, incidents, overrides, and representative transcripts.
4. Use shadow, canary, or A/B comparisons when real-world causal evidence is
   required and exposure is authorized.
5. Investigate distribution or grader drift rather than treating every metric
   change as target regression.
6. Promote confirmed new failures into controlled offline cases.
7. Reassess thresholds and retirement when context, users, models, tools, or
   risks change.

Anthropic describes automated evals, monitoring, experiments, feedback, and
human review as complementary evidence layers.[^anthropic-evals] NIST requires
predeployment testing, production monitoring, and recurring reassessment as
contexts and risks evolve.[^nist-rmf]

Production data is not automatically ground truth. It may be selected,
privacy-sensitive, delayed, or missing counterfactuals; record those limits.

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents

[^nist-rmf]: NIST — AI RMF Core
