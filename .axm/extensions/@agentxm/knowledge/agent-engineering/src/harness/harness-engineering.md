---
type: Explanation
title: Harness engineering
description: How harness engineering designs the runtime, interfaces, state, feedback, authority, and environment adaptation that turn model capability into reliable agent behavior.
tags: [harness, agents, runtime, feedback, controls, systems, environment-adaptation]
status: stable
sources:
  - id: openai-harness-engineering
    resource: https://openai.com/index/harness-engineering/
    title: OpenAI — Harness engineering
  - id: ai-harness-runtime
    resource: https://arxiv.org/abs/2605.13357
    title: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-09
---

# Harness engineering

**Harness engineering** is the discipline of designing, evaluating, and
maintaining the system around an agent so that a model's latent capability
becomes useful, bounded, and verifiable behavior. The harness mediates between
intent, the model, and the environment in which work happens.

The central idea is that deployed agent behavior is a property of a system, not
of the model alone. Agent engineering defines the goal-directed behavioral
contract; harness engineering implements and enforces the operating conditions:

```text
intent → harness → model ↔ working environment → evidence and outcome
```

A capable model can still fail when it receives the wrong context, cannot
observe the relevant state, uses a poor action interface, loses task progress,
or has no reliable way to establish completion. Conversely, a well-designed
harness can make the same model more effective by shaping those conditions.
OpenAI describes this shift as engineering environments, intent, and feedback
loops rather than focusing only on writing code or prompts.[^openai-harness-engineering]

## What the harness owns

A harness may be small or distributed, but it normally carries some combination
of these responsibilities:

| Responsibility                    | Question                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Task-contract delivery            | How is the agent-owned goal, responsibility, evidence, and stopping contract represented and enforced? |
| Context delivery                  | How is selected information made available through the runtime?                                        |
| Action and observation interfaces | What can the agent do and inspect?                                                                     |
| Runtime and environment           | Where does work execute, and how is it isolated and reproduced?                                        |
| State and continuity              | How are task and execution state persisted, reconciled, and resumed?                                   |
| Feedback and verification         | What mechanical evidence and failure signals are produced and retained?                                |
| Authority and containment         | How are permissions, approvals, budgets, isolation, and hard limits enforced?                          |
| Operation and improvement         | How are runs observed, evaluated, diagnosed, and improved?                                             |

Recent research describes a similar runtime substrate spanning task
specification delivery, context access, tools, project memory, task state,
observability, failure attribution, verification, permissions, and maintenance
state.[^ai-harness-runtime] Capability-selection policy, reflection, replanning,
recovery choice, delegation, and termination remain behavioral responsibilities
rather than becoming harness responsibilities merely because the harness
executes them.

## More than prompting

Prompting supplies language to a model at a particular moment. Harness
engineering decides the larger conditions under which prompts are assembled,
actions are permitted, state changes, and outcomes are judged.

An instruction such as “run the tests” is prompt-level guidance. A harness can
also provide the test command, provision its dependencies, execute it in an
isolated workspace, summarize its output, enforce a hard completion gate, and
retain the result as evidence. The agent's behavioral contract decides when to
run the check and how to respond; reliability comes from both responsibilities.

Harness engineering is also broader than selecting an agent framework. A
framework supplies implementation primitives; harness engineering decides how
those primitives should work together for a particular distribution of tasks.

## Principles that transfer across domains

### Design the model–harness–environment system

Judge the behavior of the complete system. Replacing the model may help, but
many failures originate in missing information, poor interfaces, environmental
friction, ambiguous authority, or weak feedback.

### Make relevant state legible

An agent can reason only about state it can observe in a usable form. Harnesses
therefore expose the environment through files, structured tools, logs,
metrics, traces, screenshots, schemas, or other representations appropriate to
the domain. [Agent legibility](../foundations/agent-legibility.md) describes this quality and
its relationship to action, feedback, and verification.

### Prefer feedback to repeated admonition

When compliance is mechanically decidable, executable checks are stronger than
additional prose. Useful failures return specific evidence and a recovery path
to the agent.

### Bound capability structurally

Probabilistic instructions influence what an agent tends to do. Sandboxes,
scoped credentials, tool policies, and approval boundaries constrain what it
can do. Reliable harnesses use both kinds of control for different purposes.

### Keep state explicit enough to resume

Long or remote work should not depend entirely on one conversation transcript.
Plans, checkpoints, task records, and execution state let another session or
worker determine what is current and continue safely.

### Improve from observed work

Agent failures are evidence about the system. A recurring miss may indicate a
context, interface, environment, verification, or authority gap. The durable
response is the smallest change to the responsible harness surface, followed
by evaluation on representative work.

## Classify across independent axes

Harness engineering is a general discipline. Its principles are specialized
through a **domain profile**, such as software engineering, research, or
operations. The domain is distinct from where harness adaptation lives, who
owns it, where it executes, how state persists, and which controls it enforces.
Autonomy, supervision, goal horizon, and coordination topology classify the
agent design, not the harness alone.

This distinction prevents category errors. A **coding harness** names the
software-engineering domain; a **repository harness** names environment-side,
repository-owned adaptation. They often compose, but they are not competing
names for the same axis. See [Harness classification](harness-classification.md)
for the axes and recognizable applied profiles.

## Relationship to neighboring concepts

- [System elements and boundaries](../foundations/system-elements-and-boundaries.md)
  assigns the informational environment and its lifecycle to context.
- [Agent legibility](../foundations/agent-legibility.md) describes whether task-relevant
  intent, state, interfaces, and evidence are usable by the agent.
- [Agent-system composition](../foundations/agent-system-composition.md) separates the agent,
  harness core, adapted environment, runtime substrate, orchestration,
  governance, and evaluation responsibilities.
- [Harness classification](harness-classification.md) separates application
  domain, adaptation locus, ownership scope, topology, continuity, authority,
  and evaluation role.
- [Software engineering harnesses](../domains/software-engineering/harnesses.md)
  apply the discipline to software work.
- [Agent instruction files](../domains/software-engineering/agent-instruction-files.md) and
  [agent skills](../skills/agent-skills.md) are elements that implement
  parts of a harness; neither is the harness by itself.
- [Context](../context/) owns detailed information selection, routing, memory,
  compaction, and lifecycle practices.
- [Prompts](../prompts/) own reusable model-facing instruction, template,
  example, presentation, and prompt-evaluation practices.
- The [glossary](../glossary.md) defines the vocabulary used across the bundle.

[^openai-harness-engineering]: OpenAI — Harness engineering

[^ai-harness-runtime]: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
