---
type: How-to guide
title: How to build a task distribution and case suite
description: Turns intended use, real failures, edges, and adversarial conditions into representative and balanced cases.
tags: [task-distribution, case-suite, sampling, representative-data, edge-cases, adversarial]
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

# How to build a task distribution and case suite

1. Start from the intended deployment population and decision, not an available
   benchmark.
2. Convert manual checks, product requirements, user failures, incidents,
   support reports, and red-team findings into candidate cases.
3. Include ordinary, edge, malformed, adjacent-negative, denied, partial,
   interruption, recovery, and adversarial conditions where material.
4. Balance when behavior should occur with when it should not; one-sided suites
   reward overtriggering.
5. Make each task unambiguous enough that qualified reviewers can agree on the
   success conditions.
6. Prove solvability with a reference solution or known passing state when
   practical.
7. Separate development cases from held-out decision cases and protect both
   from contamination.
8. Record sampling gaps and avoid claims beyond represented conditions.

OpenAI recommends production-aligned data containing typical, edge, and
adversarial cases.[^openai-evals] Anthropic recommends beginning with real
failures, balancing positive and negative behavior, and treating unexpectedly
impossible tasks as possible evaluation defects.[^anthropic-evals]

Synthetic cases expand coverage but do not establish deployment
representativeness by themselves. Keep source class and generation method
visible for every case.

[^openai-evals]: OpenAI — Evaluation best practices

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
