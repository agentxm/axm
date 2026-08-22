---
type: Reference
title: Agent loop, feedback, and termination
description: Designs the observe-decide-act loop, progress evidence, stop conditions, and escalation.
tags: [agent-loop, feedback, stopping, termination, exit-conditions, escalation, budgets]
status: stable
sources:
  - id: anthropic-trust
    resource: https://www.anthropic.com/research/trustworthy-agents
    title: Anthropic — Building and evaluating trustworthy agents
  - id: openai-guide
    resource: https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
    title: OpenAI — A practical guide to building agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Agent loop, feedback, and termination

An agent loop should make progress through evidence, not merely continue until
a model emits a final answer.

```text
observe state → choose next commitment → act → interpret result
      ↑                                      ↓
      └──── replan, recover, escalate, or terminate ────┘
```

For every action class define:

- which observations justify it;
- which effect or evidence it should produce;
- how success, no effect, partial effect, and ambiguous effect differ;
- whether retry is safe and under which identity;
- when to choose a fallback, ask a human, or stop.

## Termination contract

Use independent exits for:

- **success** — named completion evidence holds;
- **bounded exhaustion** — time, action, cost, or retry budget is reached;
- **blocked work** — required authority, information, capability, or external
  state is unavailable;
- **risk escalation** — consequence or uncertainty crosses a review boundary;
- **invalid task** — the goal is contradictory, unsafe, obsolete, or no longer
  relevant;
- **cancellation** — a responsible actor withdraws the assignment.

Hard budgets and enforced approval gates belong to the harness. The agent
design owns how those signals affect its next choice and what useful state it
returns. Trustworthy-agent guidance describes the basic loop as planning,
acting, observing, and adjusting under human control and secure interaction.[^anthropic-trust]
OpenAI describes agent runs as loops with explicit exit conditions,
including completion, failure, and maximum-turn limits.[^openai-guide]

Do not treat repeated self-reflection as progress. Require new evidence,
meaningful state change, or escalation; otherwise terminate the loop.

[^anthropic-trust]: Anthropic — Building and evaluating trustworthy agents

[^openai-guide]: OpenAI — A practical guide to building agents
