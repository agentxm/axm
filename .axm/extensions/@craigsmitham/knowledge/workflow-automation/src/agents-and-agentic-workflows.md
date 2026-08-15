---
type: Reference
title: Agents and agentic workflows
description: Distinguishes deterministic automation, LLM workflows, agents, and agents contained within durable workflows by who controls execution.
tags: [agents, agentic-workflows, llm-workflows, automation, control-flow, durability, orchestration]
status: stable
sources:
  - id: anthropic-agents
    resource: https://www.anthropic.com/engineering/building-effective-agents
    title: Anthropic — Building effective agents
  - id: openai-guide
    resource: https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
    title: OpenAI — A practical guide to building agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Agents and agentic workflows

Classify a system by who controls its meaningful next steps, not by whether it
uses a model, tool, graph, or “agent” product label.

| Form | Control path | Workflow-automation ownership | Agent-engineering ownership |
| --- | --- | --- | --- |
| Deterministic automation | Code or rules choose every step | Complete definition and execution lifecycle | None |
| LLM workflow | A predefined graph invokes models at known steps | Graph, dependencies, state, retries, timeout, cancellation, compensation | Only local model behavior if a step has bounded dynamic choice |
| Agent | A model-directed loop chooses meaningful next steps | Optional surrounding invocation or delivery process | Goal, planning, capability choice, recovery, delegation, stopping |
| Agentic workflow | Durable workflow surrounds one or more bounded agent steps | Trigger, dependencies, durable progress, approvals, retries, cancellation, compensation, reconciliation | Dynamic decisions inside each agent step and between delegated actors |

Anthropic's operational distinction is that workflows follow predefined code
paths while agents dynamically direct their process and tool use.[^anthropic-agents]
Use the simplest adequate form: deterministic code for stable mechanics, an LLM
workflow for bounded judgment in a known process, and an agent only where a
dynamic path creates material value.

## Composition rules

- Give the workflow durable ownership of schedules, events, dependencies,
  waits, timeouts, cancellation, retries, compensation, and process status.
- Give the agent a bounded goal contract, capability policy, evidence needs,
  budget, stop conditions, and escalation path for its dynamic step.
- Reconcile uncertain external effects before either layer retries.
- Persist an agent result as a typed artifact or effect receipt, not merely a
  conversational claim.
- Do not let the workflow engine's graph imply that every node is an agent, or
  let an agent's internal plan become the durable workflow definition by
  accident.

OpenAI recommends starting with a single agent and introducing multi-agent
coordination only when tool or instruction complexity warrants it.[^openai-guide]
That agent may still be one bounded participant in a larger durable workflow.

[^anthropic-agents]: Anthropic — Building effective agents
[^openai-guide]: OpenAI — A practical guide to building agents
