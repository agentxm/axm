---
type: Reference
title: Agents, workflows, and automation
description: Distinguishes model-directed agency from predefined execution and simpler automation.
tags: [agents, workflows, automation, agency-choice, control-flow, llm-workflows]
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

# Agents, workflows, and automation

The useful boundary is **who chooses the next meaningful step**. Anthropic
defines workflows as systems whose model and tools follow predefined code
paths, and agents as systems whose model dynamically directs the process and
tool use.[^anthropic-agents]

| Form                     | Primary control                                     | Best fit                                                                   |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Deterministic automation | Code or rules                                       | Stable inputs, known transformations, strict predictability                |
| LLM workflow             | Predefined graph with model-valued steps            | Classification, extraction, generation, or judgment inside a known process |
| Agent                    | Model-directed loop inside hard boundaries          | Open-ended paths, changing evidence, tool choice, and recovery             |
| Agentic workflow         | Workflow outside, one or more bounded agents inside | Durable business process with locally dynamic work                         |

## Agency test

Use an agent only when the task benefits materially from several of these:

- the necessary path cannot be enumerated economically;
- observations change which action is appropriate;
- the system must select among capabilities or information sources;
- intermediate results require replanning;
- success depends on judgment across heterogeneous cases.

Prefer a workflow when control flow, dependencies, retries, compensation, or
approval sequence are known and should remain inspectable. Prefer deterministic
code when a model adds no necessary judgment.

## Complexity is a cost

Agency increases behavioral variance, attack surface, evaluation burden, and
the difficulty of attributing failures. Multiple agents add coordination and
consistency costs. OpenAI likewise recommends maximizing a single agent before
splitting responsibilities across several.[^openai-guide]

Do not classify a system as an agent merely because it uses an LLM, calls a
tool, runs in a graph, or has an “agent” product label. State the model-directed
decisions explicitly.

[^anthropic-agents]: Anthropic — Building effective agents

[^openai-guide]: OpenAI — A practical guide to building agents
