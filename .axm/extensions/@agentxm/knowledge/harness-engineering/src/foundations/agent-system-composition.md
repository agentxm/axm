---
type: Explanation
title: Agent-system composition
description: How agents, harnesses, environments, runtime substrates, orchestration, governance, and evaluation compose without becoming synonyms.
tags: [agent-systems, harness, runtime, orchestration, governance, platforms, evaluation]
status: stable
sources:
  - id: microsoft-agent-harness
    resource: https://learn.microsoft.com/en-us/agent-framework/agents/harness
    title: Microsoft Agent Framework — Agent harness
  - id: aws-harness-runtime
    resource: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-vs-runtime.html
    title: Amazon Bedrock AgentCore — Agent harnesses and agent runtimes
  - id: cloudflare-harnesses
    resource: https://developers.cloudflare.com/agents/harnesses/
    title: Cloudflare Agents — Harnesses
  - id: anthropic-agents
    resource: https://www.anthropic.com/engineering/building-effective-agents
    title: Anthropic — Building effective agents
generated:
  by: codex/gpt-5.6
  at: 2026-08-14T22:24:33Z
stale_after: 2027-02-14
---

# Agent-system composition

An **agent system** is the complete arrangement that turns an intent into
actions and outcomes. Its agent harness is important, but the system may also
include an adapted working environment, execution infrastructure,
orchestration, governance, and an evaluation harness.

Use responsibility boundaries rather than vendor package boundaries. One
product or process may implement several layers; a distributed deployment may
split one layer across several services.

| Layer                       | Primary responsibility                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Agent                       | Own the goal contract, decision and planning policy, capability selection, recovery, delegation, and termination behavior |
| Harness core                | Assemble model interactions, implement tools, advance the loop, persist run state, and enforce controls                   |
| Environment adaptation      | Make a target environment legible, actionable, bounded, and verifiable for agents                                         |
| Runtime substrate           | Supply compute, processes, isolation, dependencies, lifecycle, and durable execution facilities                           |
| Orchestration plane         | Admit and dispatch work, coordinate workers, manage dependencies, and reconcile results                                   |
| Governance or control plane | Enforce identity, policy, approvals, budgets, audit, and organization-wide authority                                      |
| Evaluation harness          | Administer cases and trials around a named target, collect evidence, invoke graders, and aggregate results                |

An **agent host** is the process or service that runs an agent and its harness
core. An **agent platform** supplies reusable facilities across multiple agent
systems, commonly runtime, orchestration, governance, observability, and
integration services. Neither term guarantees a particular autonomy level or
architecture.[^microsoft-agent-harness][^aws-harness-runtime]

## Composition, not containment

The effective behavior emerges from the layers working together:

```text
agent + harness core + adapted environment + runtime substrate
      + orchestration/governance as needed = operating agent system

evaluation harness + named target + task distribution + graders
      = evaluation system
```

The target of an evaluation may be a model, prompt, skill, harness, or complete
agent system. The evaluation harness therefore surrounds the target for
measurement; it is not automatically part of the production harness.

Likewise, a runtime runs the harness but does not decide the agent's loop, tool
policy, or task strategy merely by providing compute. AWS makes this harness–
runtime distinction explicit, while Microsoft and Cloudflare use “harness” for
the agent-facing loop and integration layer.[^aws-harness-runtime]
[^microsoft-agent-harness][^cloudflare-harnesses]

## Boundaries vary; responsibilities remain

“Agent,” “assistant,” “framework,” “harness,” and “platform” are often product
labels as well as architectural terms. Diagnose a system by asking which
responsibility owns a behavior, not by inferring architecture from the label.
Anthropic's distinction between predefined workflows and model-directed agents
is similarly a behavioral distinction; either may still use runtime,
environment, and governance infrastructure.[^anthropic-agents]

Use [Harness classification](harness-classification.md) to describe a concrete
system along independent axes rather than forcing it into one overloaded noun.

[^microsoft-agent-harness]: Microsoft Agent Framework — Agent harness

[^aws-harness-runtime]: Amazon Bedrock AgentCore — Agent harnesses and agent runtimes

[^cloudflare-harnesses]: Cloudflare Agents — Harnesses

[^anthropic-agents]: Anthropic — Building effective agents
