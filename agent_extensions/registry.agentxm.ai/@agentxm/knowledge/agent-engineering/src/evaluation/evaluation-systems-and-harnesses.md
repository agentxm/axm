---
type: Explanation
title: Evaluation systems and harnesses
description: Separates the target, operational agent harness, evaluation harness, environment, evidence, and decision.
tags: [evaluation-harness, agent-harness, target-system, environment, instrumentation]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
---

# Evaluation systems and harnesses

An evaluation system contains distinct responsibilities:

```text
case + fixture
      ↓
evaluation harness → target system ↔ environment
      ↓                    ↓
trial record ← trace + artifacts + final state
      ↓
graders → aggregation → decision evidence
```

- The **target** is the exact model, prompt, context system, agent, harness,
  skill, or application whose behavior is in question.
- An **agent harness** enables a model to act by constructing inputs,
  orchestrating calls and tools, managing state, and returning results.
- An **evaluation harness** administers cases and trials, provisions isolation,
  records evidence, invokes graders, and aggregates results.
- The **environment** supplies state, tools, permissions, time, services, and
  failure conditions that influence behavior.

Anthropic explicitly separates evaluation harnesses from agent harnesses and
notes that evaluating an agent measures the harness and model together.[^anthropic-evals]

Version every material member. If the evaluation harness constrains the target,
leaks state, or fails to observe decisive outcomes, its defects must not be
attributed to the target.

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
