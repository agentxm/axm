---
type: Explanation
title: Agent engineering
description: Defines the discipline as the design and stewardship of goal-directed model behavior.
tags: [agent-engineering, agentic-systems, behavior, goals, control, lifecycle]
status: stable
sources:
  - id: agent-survey
    resource: https://arxiv.org/abs/2308.11432
    title: A Survey on Large Language Model based Autonomous Agents
  - id: anthropic-agents
    resource: https://www.anthropic.com/engineering/building-effective-agents
    title: Anthropic — Building effective agents
  - id: openai-guide
    resource: https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
    title: OpenAI — A practical guide to building agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Agent engineering

**Agent engineering** designs and stewards goal-directed software actors whose
next actions are selected partly by a model from observations. It owns the
behavioral system: whether agency is warranted, what the agent is responsible
for, how it decides and acts, how it responds to evidence, when it delegates,
stops, or escalates, and how its behavior is evaluated and improved.

```text
goal contract → observe → decide → act → interpret feedback
                         ↘ stop, escalate, or delegate
```

Modern surveys commonly describe planning, memory, action, and an agent profile
or role as central components.[^agent-survey] Engineering extends beyond those
components to deployment choices, human control, security, failure attribution,
and lifecycle.

## What the discipline owns

| Responsibility        | Agent-engineering question                                         |
| --------------------- | ------------------------------------------------------------------ |
| Agency choice         | Does this task need model-directed control?                        |
| Goal contract         | What outcome, boundaries, evidence, and stopping rules apply?      |
| Control policy        | How are observations turned into actions, recovery, or escalation? |
| Capability policy     | When and why may a tool, memory, or delegate be used?              |
| Coordination          | Which actor owns each responsibility and result?                   |
| Human control         | Where can people understand, direct, approve, interrupt, or stop?  |
| Trust and reliability | Which failures, attacks, and misleading signals must be resisted?  |
| Lifecycle             | How is behavior observed, changed, re-evaluated, and retired?      |

## What it does not absorb

Agent engineering specifies behavior; it does not own every mechanism that
influences it. Harness engineering implements loops, tools, persistence,
permissions, and runtime controls. Context engineering owns the information
lifecycle. Prompt engineering owns model-facing expression. Workflow
automation owns predefined durable execution. Skill engineering owns reusable
job packages. Evaluation engineering owns general measurement method.

Start with the simplest system that can achieve the outcome. Practitioner
guidance from Anthropic and OpenAI both favors workflows or single-agent loops
before adding open-ended autonomy or multiple agents.[^anthropic-agents][^openai-guide]

[^agent-survey]: A Survey on Large Language Model based Autonomous Agents

[^anthropic-agents]: Anthropic — Building effective agents

[^openai-guide]: OpenAI — A practical guide to building agents
