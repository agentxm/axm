---
type: Playbook
title: Eval-driven development
description: Uses evaluations before and throughout development to define success, compare attributable changes, and retain regressions.
tags: [eval-driven-development, comparison, regression, iteration, attribution]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: openai-evals
    resource: https://developers.openai.com/api/docs/guides/evaluation-best-practices
    title: OpenAI — Evaluation best practices
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
---

# Eval-driven development

1. Name the product decision and success criteria before optimizing the target.
2. Establish a representative case set, environment, grader set, and baseline.
3. Preserve the exact target and evaluation identities.
4. Change one attributable surface where practical.
5. Run enough isolated trials to reveal decision-relevant variance.
6. Inspect raw outputs, traces, external state, surprising passes, and failures.
7. Classify target, case, environment, harness, and grader failures separately.
8. Retain a change only when intended outcomes improve without unacceptable
   regressions, cost, latency, authority, or risk.
9. Convert confirmed field failures and discoveries into regression cases.
10. Run affected cases continuously and revisit representativeness over time.

OpenAI recommends evaluating early and continuously, mining logs for cases, and
calibrating automated scoring with humans.[^openai-evals] Anthropic recommends
defining capabilities through evals early and maintaining suites as routine
product work.[^anthropic-evals]

Evaluation guides development; it does not authorize the evaluator to repair a
target during a supposedly controlled run. Separate measurement from mutation
when attribution or independent judgment matters.

[^openai-evals]: OpenAI — Evaluation best practices

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
