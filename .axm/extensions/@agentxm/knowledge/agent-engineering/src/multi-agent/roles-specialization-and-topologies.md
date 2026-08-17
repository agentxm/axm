---
type: Reference
title: Roles, specialization, and topologies
description: Selects actor roles and centralized, decentralized, sequential, parallel, or hierarchical coordination.
tags: [multi-agent, roles, specialization, topology, supervisor-worker, peers, orchestration]
status: stable
sources:
  - id: multi-agent-survey
    resource: https://link.springer.com/article/10.1007/s44336-024-00009-2
    title: Large Language Model based Multi-Agents — A Survey of Progress and Challenges
  - id: anthropic-multi-agent
    resource: https://www.anthropic.com/engineering/multi-agent-research-system
    title: Anthropic — How we built our multi-agent research system
  - id: openai-orchestration
    resource: https://openai.github.io/openai-agents-python/multi_agent/
    title: OpenAI Agents SDK — Agent orchestration
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Roles, specialization, and topologies

Add an actor only when it owns a separable responsibility, authority boundary,
context boundary, or independent unit of work. A different persona alone is
not sufficient. Multi-agent surveys likewise distinguish individual-agent
design from mutual interaction and system evolution.[^multi-agent-survey]

| Topology                           | Use when                                                        | Main risk                                            |
| ---------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| Manager or supervisor with workers | One actor can decompose, dispatch, and reconcile separable work | Bottleneck, bad decomposition, unverified synthesis  |
| Handoffs among specialists         | Responsibility should transfer with the task state              | Lost accountability or context                       |
| Sequential specialists             | Outputs have clear dependency order                             | Error propagation and latency                        |
| Parallel workers                   | Work is independent and results can be reconciled               | Duplication, conflict, cost explosion                |
| Peer coordination                  | No stable central authority fits                                | Deadlock, inconsistent state, diffuse responsibility |
| Hierarchy                          | Scale or domain structure requires nested coordination          | Cascading errors and poor observability              |

Anthropic's research system uses an orchestrator-worker pattern for breadth and
parallel search, while reporting coordination, token use, and evaluation as
significant engineering concerns.[^anthropic-multi-agent] OpenAI distinguishes
manager-style agents-as-tools from decentralized handoffs.[^openai-orchestration]

Choose the smallest topology that creates a measurable advantage over one
agent with tools. Define which actor owns the final result, which may commit
effects, and how conflicting outputs are reconciled.

[^multi-agent-survey]: Large Language Model based Multi-Agents — A Survey of Progress and Challenges

[^anthropic-multi-agent]: Anthropic — How we built our multi-agent research system

[^openai-orchestration]: OpenAI Agents SDK — Agent orchestration
