---
type: Reference
title: Trials, variance, and uncertainty
description: Designs repeated trials and reports distributions and uncertainty without treating one run as stable behavior.
tags: [trials, nondeterminism, variance, uncertainty, pass-at-k, reliability]
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

# Trials, variance, and uncertainty

A **trial** is one attempt at one task under a recorded configuration. Repeat
trials when outputs, tool decisions, environments, graders, or user simulators
can vary.

- Choose repetition from the decision risk and expected effect size, not a
  universal count.
- Start every intended-independent trial from isolated state; shared caches,
  files, quotas, or resource exhaustion create correlated evidence.
- Report per-task outcomes and distributions, not only the best run or suite
  average.
- Use `pass@k` when one successful attempt among several is the product
  contract; use repeated-success measures when consistency on every attempt is
  the requirement.[^anthropic-evals]
- Expand trials when a disposition would turn on one unstable result.
- Distinguish target variance, grader variance, simulator variance, and
  environment flakiness.
- Report uncertainty and unsupported generalization explicitly; NIST requires
  measurement processes to include uncertainty.[^nist-rmf]

Do not convert “not observed” into “cannot happen.” A small suite can reveal a
large regression without supporting a precise population estimate.

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
[^nist-rmf]: NIST — AI RMF Core
