---
type: Reference
title: Evaluation boundaries
description: Distinguishes evaluations from tests, verification, benchmarks, red teaming, monitoring, experiments, and audits.
tags: [tests, verification, benchmarks, red-teaming, monitoring, experiments, audit]
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

# Evaluation boundaries

| Practice       | Primary question                                                       | Relationship to evaluation                                                        |
| -------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Test           | Did one assertion hold?                                                | A test may be a deterministic grader inside an evaluation.                        |
| Verification   | Does this exact artifact or change satisfy an accepted contract?       | Uses bounded conformance evidence rather than estimating a behavior distribution. |
| Benchmark      | How do targets compare on a standardized suite?                        | A reusable evaluation whose comparability can outweigh local fit.                 |
| Metric         | What quantity was observed?                                            | One instrument or output, not the complete evaluation.                            |
| Red teaming    | What consequential failure can an adversary discover?                  | Discovery activity; confirmed failures should become repeatable cases.            |
| Monitoring     | What is happening in production?                                       | Supplies field evidence and drift signals, often without controlled ground truth. |
| A/B experiment | Which deployed variant changes real outcomes?                          | Controlled field comparison with user exposure and statistical obligations.       |
| Audit          | Is evidence, process, trust, or conformance independently supportable? | Reviews the target or the evaluation rather than merely running its suite.        |

OpenAI distinguishes industry benchmarks, numerical metrics, and application-
specific evaluations.[^openai-evals] Anthropic treats automated evals,
production monitoring, user feedback, experiments, and human review as
complementary layers rather than substitutes.[^anthropic-evals]

Do not use `eval` as a synonym for every quality activity. Name the decision,
the target, and the evidence-producing method.

[^openai-evals]: OpenAI — Evaluation best practices

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
