---
type: Explanation
title: Capability and regression suites
description: Separates hill-climbing evidence from reliable-behavior protection and manages graduation and saturation.
tags: [capability-evals, regression-evals, saturation, quality-bar, continuous-evaluation]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
---

# Capability and regression suites

| Suite | Question | Expected shape |
| --- | --- | --- |
| Capability | What valuable behavior can the system learn or improve? | Difficult representative tasks with room to climb |
| Regression | Does accepted behavior remain reliable? | High expected pass rate and continuous execution |

Anthropic recommends operating both suite types: capability cases expose room
for improvement, while regression cases protect behavior already achieved.
Solved capability cases can graduate into regression coverage.[^anthropic-evals]

Keep their interpretation separate. A low capability score can be useful; a
similar regression score indicates breakage. When a capability suite saturates,
retain the important solved cases as regressions and add harder work drawn from
the evolving deployment distribution. Do not manufacture difficulty that lacks
product relevance.

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
