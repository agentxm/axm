---
type: Reference
title: Evaluation lifecycle and governance
description: Treats suites and graders as versioned products with owners, provenance, review, freshness, and retirement.
tags: [evaluation-governance, ownership, provenance, freshness, versioning, retirement]
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
  - id: openai-evals
    resource: https://developers.openai.com/api/docs/guides/evaluation-best-practices
    title: OpenAI — Evaluation best practices
---

# Evaluation lifecycle and governance

Treat each suite as an owned product:

- version tasks, fixtures, environments, harnesses, graders, rubrics, and
  analysis rules independently;
- bind every report to the exact evaluated target and evaluation identity;
- preserve raw evidence or durable locators subject to privacy and security;
- separate author claims, evaluation results, independent review, and the
  final management decision;
- assign owners for infrastructure while enabling domain and product experts
  to contribute cases;
- set review triggers for target, model, host, environment, grader, population,
  risk, or policy changes;
- track ambiguity, broken cases, saturation, leakage, and unresolved claims;
- deprecate superseded suites and retain decision provenance; and
- retire measurements that no longer supply unique decision value.

Anthropic calls evaluation suites living artifacts needing clear ownership and
ongoing contribution.[^anthropic-evals] NIST requires documented roles,
methods, results, independent review, and evaluation of measurement efficacy.[^nist-rmf]

Keep durable knowledge independent of one provider API. OpenAI's current Evals
platform is scheduled for shutdown in 2026, illustrating why tool instructions
should remain profiles rather than the core method.[^openai-evals]

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents

[^nist-rmf]: NIST — AI RMF Core

[^openai-evals]: OpenAI — Evaluation best practices
