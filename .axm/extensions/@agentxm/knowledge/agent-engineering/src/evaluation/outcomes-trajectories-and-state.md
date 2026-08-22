---
type: Explanation
title: Outcomes, trajectories, and state
description: Selects evidence from final results, external state, and execution traces without overconstraining valid paths.
tags: [outcome-evaluation, trajectory-evaluation, traces, external-state, agent-evals]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: openai-agent-evals
    resource: https://developers.openai.com/api/docs/guides/agent-evals
    title: OpenAI — Evaluate agent workflows
  - id: google-agent-evals
    resource: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-agents
    title: Google Cloud — Evaluate Gen AI agents
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
---

# Outcomes, trajectories, and state

Evaluate the evidence surface that carries the contract:

- **Response** — what the user or downstream system received.
- **Outcome** — whether the intended external state or artifact exists.
- **Trajectory** — tool calls, handoffs, observations, intermediate results,
  guardrails, and other process evidence.
- **Operational measures** — cost, latency, turns, retries, and resource use.

OpenAI uses trace grading to locate tool, handoff, instruction, and safety
failures before promoting them into repeatable datasets.[^openai-agent-evals]
Google separates final-response and trajectory evaluation.[^google-agent-evals]

Prefer outcome or external-state grading when several valid paths exist. Grade
the trajectory when authority, safety, required obligations, attribution,
recovery, or efficiency makes the path consequential. Anthropic warns that
exact golden paths can reject creative valid solutions.[^anthropic-evals]

A plausible statement of success is not proof that the state changed. A valid
outcome does not excuse a prohibited action. Report both independently where
both are contractual.

[^openai-agent-evals]: OpenAI — Evaluate agent workflows

[^google-agent-evals]: Google Cloud — Evaluate Gen AI agents

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
