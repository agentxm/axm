---
type: Reference
title: Agent-specific evaluation
description: Defines the scenarios, behaviors, trajectories, and risks an agent design must supply to evaluation engineering.
tags:
  [agent-evaluation, trajectories, outcomes, task-distribution, robustness, safety, human-oversight]
status: stable
sources:
  - id: eval-survey
    resource: https://arxiv.org/abs/2503.16416
    title: Survey on Evaluation of LLM-based Agents
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: openai-evals
    resource: https://developers.openai.com/api/docs/guides/evaluation-best-practices
    title: OpenAI — Evaluation best practices
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Agent-specific evaluation

Agent engineering supplies the **what**: the behaviors, risks, trajectories,
states, and deployment scenarios that must be measured. Evaluation engineering
supplies the **how**: objectives, sampling, trials, graders, baselines,
uncertainty, aggregation, validity, and lifecycle.

## Bind the target identity

Record at least the goal contract, model, prompts, tool set and permissions,
memory policy, coordination topology, autonomy classification, environment,
termination policy, and harness/runtime version. A score without these
identities cannot be attributed to the agent design.

## Evaluate more than final answers

- task outcome and external effects;
- observation and tool-selection quality;
- plan quality, unnecessary actions, and replanning;
- stopping, escalation, and budget behavior;
- recovery from tool, context, and environment failure;
- memory writes, retrieval influence, and stale or poisoned state;
- delegation, handoff, synthesis, and multi-agent consistency;
- human intervention quality and approval usability;
- safety, privacy, security, robustness, cost, and latency.

Use both outcome graders and trajectory inspection because an acceptable result
can arise through unsafe behavior, and a sensible trajectory can still fail to
produce the required effect.[^anthropic-evals] Sample realistic tasks and run
repeated trials where model or environment variance matters.[^openai-evals]

The evaluation survey literature likewise treats planning, tool use,
self-reflection, memory, cost, safety, and robustness as distinct agent
capabilities or concerns.[^eval-survey]

[^eval-survey]: Survey on Evaluation of LLM-based Agents

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents

[^openai-evals]: OpenAI — Evaluation best practices
