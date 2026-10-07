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

## Artifact lifecycle

Evaluation artifacts have different authorities and retention needs:

| Artifact class | Typical authority | Normal storage |
| --- | --- | --- |
| Contract, cases, fixtures, graders, and harness source | Versioned evaluation source | Repository |
| Trial outputs, traces, state, timing, and grades | Generated observation | Ignored workspace or CI artifact |
| Aggregate benchmark or analysis | Reproducible derivation | Run workspace or CI artifact |
| Release or admission evidence manifest | Deliberately promoted decision evidence | Durable repository path or evidence archive |
| Approval, exception, rollout, or retirement | Governance decision | Governance system |

Source control is an authority choice, not an evidence grade. Committing a run
does not make it independent, reproducible, or suitable for release. Conversely,
an external artifact is not durable unless its identity, integrity, access, and
expiry support the decision that cites it. Use
[How to manage evaluation assets and evidence](managing-evaluation-assets-and-evidence.md)
to apply this lifecycle in a repository.

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
