---
type: Explanation
title: Agent legibility
description: How agent legibility makes task-relevant intent, state, capabilities, constraints, and feedback discoverable and usable by an agent.
tags: [harness, agents, legibility, observability, interfaces, feedback, environment]
status: stable
sources:
  - id: openai-harness-engineering
    resource: https://openai.com/index/harness-engineering/
    title: OpenAI — Harness engineering
  - id: ai-harness-runtime
    resource: https://arxiv.org/abs/2605.13357
    title: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
generated:
  by: codex/gpt-5.6
  at: 2026-08-09T20:53:20Z
verified:
  - by: codex/gpt-5.6
    at: 2026-08-09T22:13:44Z
stale_after: 2027-02-09
---

# Agent legibility

**Agent legibility** is the degree to which a harness and working environment
render task-relevant intent, state, structure, capabilities, constraints, and
consequences in forms an agent can discover, interpret, use, and verify.

From an agent's perspective, inaccessible or uninterpretable state is
operationally similar to missing state. OpenAI describes agent legibility as a
goal of making the business domain and application behavior directly
available for reasoning through repository knowledge, tools, user-interface
representations, logs, metrics, and traces.[^openai-harness-engineering]

Legibility does not require exposing everything. It requires exposing the
right distinctions at the point where they can change a decision.

## A relational quality

Legibility is not an intrinsic property of a file, interface, or system. It is
a relationship among:

- an agent's capabilities;
- the task it is trying to perform;
- the representations the harness provides; and
- the actions and feedback available in the environment.

A dashboard may be legible to a human but unavailable to a headless agent. A
large JSON response may be machine-readable but too noisy to guide a decision.
A concise error may identify a failure without offering any action that can
resolve it. The same environment can therefore be legible for one task and
opaque for another.

## Dimensions of legibility

| Dimension        | Question                                                                  |
| ---------------- | ------------------------------------------------------------------------- |
| Discoverability  | Can the agent find the relevant source, capability, or state?             |
| Interpretability | Does its representation expose meaningful structure and distinctions?     |
| Actionability    | Can the agent use what it learned through an available interface?         |
| Feedback         | Are the consequences of action returned compactly and specifically?       |
| Verifiability    | Can the agent establish whether the intended outcome now holds?           |
| Continuity       | Can another turn, session, or worker recover what remains current?        |
| Authority        | Are permissions, limits, and escalation boundaries visible before action? |

These dimensions reinforce one another. Discoverable documentation without an
action interface may explain a system the agent cannot affect. An action
interface without feedback creates blind mutation. Feedback without task
intent reports events without saying whether they matter.

## What a harness makes legible

| Concern              | Possible representations                                          |
| -------------------- | ----------------------------------------------------------------- |
| Intent               | Task specification, acceptance criteria, examples, plan           |
| Domain and structure | Vocabulary, schemas, architecture maps, dependency graphs         |
| Capabilities         | Tool summaries, help, skills, supported operations                |
| Environment state    | Files, structured queries, snapshots, resource inventories        |
| Effects              | Diffs, receipts, events, test results, screenshots                |
| Runtime behavior     | Logs, metrics, traces, timelines                                  |
| Constraints          | Scoped instructions, schemas, policies, actionable check failures |
| Continuity           | Checkpoints, decision logs, task records, execution state         |

The runtime substrate proposed in recent harness-engineering research similarly
joins context, tools, state, observability, verification, and permissions
rather than treating any one representation as sufficient.[^ai-harness-runtime]

## Legibility is not context dumping

Making a system legible does not mean copying all of it into the active context
window. Raw exhaust can hide the useful distinction as effectively as missing
data.

[Progressive disclosure](../patterns/progressive-disclosure.md) is therefore a
key legibility pattern: advertise a compact route, then expose deeper state
when the task needs it. Summaries, indexes, queries, filters, and structured
tools can make a large environment more legible precisely because they avoid
showing everything at once.

The quality test is not “could the agent theoretically access the bytes?” It
is “could the agent find and interpret the evidence needed for this decision
without hidden human translation?”

## Legibility and abstraction

An abstraction improves legibility when it hides irrelevant mechanics while
preserving the distinctions needed for correct action. It harms legibility
when important behavior becomes observable only through undocumented side
effects, human intuition, or opaque upstream systems.

Stable schemas, narrow tools, conventional structures, deterministic checks,
and inspectable state transitions often make better agent interfaces than
free-form prose around an opaque operation. Conversely, exposing every
internal detail can bind the agent to accidental complexity and make the
intended contract harder to see.

The goal is an inspectable boundary, not maximal transparency.

## Relationship to observability and agent experience

**Observability** supplies evidence about a running system. **Agent
legibility** asks whether that evidence—and the surrounding intent,
capabilities, and constraints—can actually guide agent decisions. Logs may be
observable yet illegible if the agent cannot query them, correlate them with a
task, or distinguish expected noise from failure.

**Agent experience (AX)** is broader. It describes how effectively an agent
can operate with a technology, harness, and environment. Legibility is one
dimension of that experience; reliability, latency, safety, recoverability,
and capability also matter. A highly legible tool that fails frequently still
provides poor agent experience.

## Relationship to context gardening

[Context gardening](../practices/context-gardening.md) maintains legibility
over time. Observed searches, misunderstandings, stale answers, hidden state,
and failed verifications reveal where representations or routes need repair.
Gardening then changes the responsible context surface and checks whether the
next agent can navigate it more successfully.

## Domain specialization

The quality transfers across domains, but the representations differ:

- a software-engineering harness may expose source structure, build commands,
  application behavior, diffs, tests, and traces;
- an operations harness may expose inventories, topology, health, policy,
  incidents, and change receipts;
- a research harness may expose sources, experimental state, assumptions,
  uncertainty, and reproducible computations;
- a computer-use harness may expose semantic UI structure, screenshots,
  navigation state, and confirmation of external effects.

Domain profiles should define which state and evidence must be legible without
mistaking their preferred representations for universal harness elements.

## Common failure modes

- **Hidden truth** — necessary knowledge remains in people, private channels,
  or inaccessible systems.
- **Human-only surface** — the state is visible, but only through an interface
  the agent cannot inspect reliably.
- **Raw exhaust** — large undifferentiated outputs obscure decision-relevant
  signals.
- **Action without observation** — the agent can mutate state but cannot see
  the result.
- **Feedback without recovery** — an error names a problem without locating it
  or suggesting the next valid action.
- **Stale representation** — documentation or cached state remains plausible
  after reality changes.
- **Invisible authority** — permissions or approval boundaries appear only
  after attempted action.
- **Transcript dependence** — essential intent or progress cannot survive the
  current conversation.

## Related

- [Harness engineering](harness-engineering.md)
- [Context engineering boundary](context-engineering-boundary.md)
- [Progressive disclosure](../patterns/progressive-disclosure.md)
- [Context gardening](../practices/context-gardening.md)
- [Software engineering harnesses](../domains/software-engineering/harnesses.md)
- [Harness engineering glossary](../harness-engineering-glossary.md)

[^openai-harness-engineering]: OpenAI — Harness engineering

[^ai-harness-runtime]: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
