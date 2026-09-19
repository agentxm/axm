---
type: How-to guide
title: How to evaluate and improve a harness
description: Specializes whole-system evaluation through runtime identity, trace capture, environment fidelity, and responsible-surface attribution.
tags: [harness, evaluation, diagnosis, observability, environment-fidelity, attribution]
status: stable
sources:
  - id: openai-harness-engineering
    resource: https://openai.com/index/harness-engineering/
    title: OpenAI — Harness engineering
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
---

# How to evaluate and improve a harness

Harness evaluation applies general evaluation practice to the complete
model–harness–environment system. Its specialization is making runtime effects
observable and attributable. A model score cannot show whether a runtime
provisioned correctly, a tool hid decisive state, an approval boundary failed,
or verification accepted a false completion.[^openai-harness-engineering]

1. Bind each trial to exact model, harness, tool, policy, environment, and
   fixture identities.
2. Capture traces, external state, and artifacts sufficient to locate failures without relying
   only on the model's explanation.
3. Verify trial isolation and distinguish target behavior from evaluation-
   harness or environment failure.
4. Classify each failure by responsible surface: intent, context, interface,
   runtime, state, feedback, authority, model behavior, or environment.
5. Change the smallest responsible surface and record the expected effect.
6. Rerun affected tasks plus nearby regressions, including denied, partial,
   retry, interruption, and recovery paths.
7. Keep the change only when outcome evidence improves without unacceptable
   cost, latency, or risk.

An operational agent harness enables the target to act; an evaluation harness
administers trials, records evidence, invokes graders, and aggregates results.
Anthropic warns that agent, task, grader, scaffold, and environment failures can
otherwise be confused.[^anthropic-evals]

[^openai-harness-engineering]: OpenAI — Harness engineering
[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
