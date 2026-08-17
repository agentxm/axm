---
type: Reference
title: Harness classification
description: Independent implementation axes and applied profiles for classifying harnesses without absorbing agent behavior or product labels.
tags:
  [
    harness,
    taxonomy,
    classification,
    adaptation-locus,
    ownership,
    execution,
    persistence,
    enforcement,
  ]
status: stable
sources:
  - id: harness-properties
    resource: https://arxiv.org/abs/2606.10106
    title: What Makes a Harness a Harness? Evaluating Agentic Scaffold Properties
  - id: scaffold-taxonomy
    resource: https://arxiv.org/abs/2604.03515
    title: Inside the Scaffold — A Taxonomy of Agentic Coding System Architectures
  - id: ai-harness-runtime
    resource: https://arxiv.org/abs/2605.13357
    title: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
generated:
  by: codex/gpt-5.6
  at: 2026-08-14T22:24:33Z
stale_after: 2027-02-14
---

# Harness classification

Harness categories become inconsistent when one label names agent behavior,
another names deployment, and a third names ownership. Classify the harness
implementation along independent axes; classify autonomy, supervision, goal
horizon, and coordination topology as properties of the agent design.

## Classification axes

| Axis                  | Question                                                              | Representative values                                                                     |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Adaptation locus      | Where is agent-specific support implemented?                          | agent host, working environment, shared platform, evaluation system                       |
| Ownership and scope   | Who owns the harness adaptation, and where does it apply?             | user, repository, package, workspace, team, organization                                  |
| Execution location    | Where do model calls, tools, and effects run?                         | local, remote, browser, container, VM, managed service                                    |
| Persistence mechanism | Which identities and state can survive an invocation?                 | ephemeral process, session store, checkpointed task, durable workflow, long-lived service |
| Enforcement reach     | Which controls can the harness enforce?                               | model invocation, tool allowlist, filesystem, network, credentials, approvals, budgets    |
| Evaluation role       | Is this the operating target or the system administering measurement? | production harness, evaluation target, evaluation harness                                 |

Control flow, planning, memory policy, tool-selection policy, coordination, and
verification behavior are important scaffold properties, but their behavioral
meaning belongs to agent design. The harness classification records how those
policies are implemented, persisted, exposed, and enforced. Runtime-substrate
research likewise distinguishes the behavioral agent from the surrounding task,
tool, state, observability, verification, and permission machinery.[^harness-properties]
[^scaffold-taxonomy][^ai-harness-runtime]

## Applied profiles combine axes

**Coding harness** and **repository harness** are both useful terms, but they
answer different questions:

| Profile                     | Primary classification                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Coding-agent harness        | Agent-host adaptation implemented for software-engineering work                                           |
| Repository harness          | Environment-side adaptation owned and scoped by a repository                                              |
| Organization coding harness | Shared platform and controls owned across an organization                                                 |
| Coding evaluation harness   | Evaluation-side system administering software-engineering cases and trials                                |
| Repository coding system    | Composition of agent behavior, a coding harness, repository adaptation, execution environment, and policy |

A profile is a recognizable combination of implementation axes plus an
application context, not a new foundational discipline. State the associated
agent design separately when autonomy or behavioral topology matters.

## Treat overloaded labels as claims to unpack

Terms such as **AI OS**, **agent OS**, **framework**, **platform**,
**assistant**, **copilot**, **digital worker**, and **scaffold** do not have
stable architectural meanings. Translate them into explicit implementation
responsibilities and, separately, explicit agent-behavior properties. In
particular, an “AI OS” may mean a personal-agent host, an enterprise control
plane, a multi-agent platform, or simply an application suite; the name alone
should not determine bundle boundaries.

[^harness-properties]: What Makes a Harness a Harness? Evaluating Agentic Scaffold Properties

[^scaffold-taxonomy]: Inside the Scaffold — A Taxonomy of Agentic Coding System Architectures

[^ai-harness-runtime]: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
