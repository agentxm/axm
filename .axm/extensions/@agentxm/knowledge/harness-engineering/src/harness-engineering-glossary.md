---
type: Reference
title: Harness engineering glossary
description: Concise definitions for agent systems, harness layers, classification axes, applied profiles, and neighboring disciplines.
tags:
  [
    harness,
    agent-systems,
    coding-harness,
    repository-harness,
    evaluation-harness,
    terminology,
    vocabulary,
  ]
status: stable
sources:
  - id: microsoft-agent-experience
    resource: https://developer.microsoft.com/blog/the-ax-stack-whats-fixed-where-you-can-win
    title: Microsoft — The AX stack
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: aws-harness-runtime
    resource: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-vs-runtime.html
    title: Amazon Bedrock AgentCore — Agent harnesses and agent runtimes
generated:
  by: codex/gpt-5.6
  at: 2026-08-14T22:24:33Z
stale_after: 2027-02-09
---

# Harness engineering glossary

This glossary establishes the bundle's working vocabulary. Product ecosystems
may use the same words differently; individual concept documents explain the
important distinctions and tradeoffs.

## Core disciplines

**Agent engineering**
: The discipline of designing and stewarding an agent's goal-directed
behavioral contract: agency choice, goals, decision loops, planning,
capability and memory policy, coordination, human control, stopping,
reliability, and lifecycle.

**Harness engineering**
: The discipline of designing, evaluating, and maintaining the system around
an agent that implements model interaction, tools, runtime, persistence,
feedback, permissions, and enforcement. See
[Harness engineering](foundations/harness-engineering.md).

**Context engineering**
: The discipline of shaping the informational environment an agent receives,
discovers, produces, and carries through a task. See
[Context engineering boundary](foundations/context-engineering-boundary.md).

**Prompt engineering**
: The discipline of designing model-facing instructions, inputs, examples,
templates, and presentation for reliable interactions. It overlaps context
engineering but has a distinct reusable craft and evaluation surface.

**Evaluation engineering**
: The discipline of designing and operating evidence systems that measure a
named target on a relevant task distribution in support of a decision.

## System and specialization

**Agent**
: A model operating in a loop that can observe, decide, act, and incorporate
the results of its actions.

**Agent harness**
: The concrete system that mediates among an agent, a task, and a working
environment. It may provide context, tools, runtime, state, feedback, and
controls.

**Agent system**
: The complete operating composition that turns intent into actions and
outcomes, potentially including an agent, harness core, adapted environment,
runtime substrate, orchestration, and governance. See
[Agent-system composition](foundations/agent-system-composition.md).

**Agent host**
: The process or service that runs an agent and its harness core.

**Harness core**
: The agent-facing layer that assembles model interactions, exposes tools,
advances the loop, and manages run state. It may be embedded in an agent
host or supplied by a framework.

**Runtime substrate**
: Compute, process, isolation, dependency, lifecycle, and durable-execution
facilities on which an agent host or harness runs. Supplying runtime does not
by itself determine the agent loop.[^aws-harness-runtime]

**Orchestration plane**
: Facilities that admit and dispatch work, coordinate agents or workers,
manage dependencies, and reconcile results across runs.

**Governance or control plane**
: Shared facilities for identity, policy, approvals, budgets, audit, and
organization-wide authority.

**Agent platform**
: A product or internal service that supplies reusable runtime,
orchestration, governance, observability, or integration facilities for
multiple agent systems. The label does not imply that every layer is present.

**Evaluation harness**
: Infrastructure that administers evaluation cases and trials around a target,
captures traces and outcomes, invokes graders, and aggregates results. It is
distinct from the agent harness being evaluated, though an evaluation run
may contain both.[^anthropic-evals]

**Agent experience (AX)**
: An emerging lens on how effectively an agent can operate with a technology,
harness, and working environment. It includes discoverability and
legibility, tool affordances, feedback quality, authority, continuity, and
recovery. In this bundle, harness engineering names the engineering
discipline; agent experience describes the resulting conditions from the
agent's perspective.[^microsoft-agent-experience]

**Agent legibility**
: The degree to which a harness and working environment render task-relevant
intent, state, capabilities, constraints, and consequences discoverable and
usable by an agent. It is one dimension of agent experience. See
[Agent legibility](foundations/agent-legibility.md).

**Application domain**
: The kind of work for which a harness is designed, such as software
engineering, research, operations, or computer use.

**Domain profile**
: A documented specialization of general harness principles for one
application domain.

**Adaptation locus**
: The system layer where agent-specific adaptation is primarily implemented,
such as the agent host, working environment, shared platform, or evaluation
system.

**Ownership and adaptation scope**
: Who owns an adaptation and where it applies, such as a user, repository,
subtree, workspace, team, or organization.

**Harness element**
: An identifiable constituent used to shape or operate a harness, such as an
instruction file, skill, tool, hook, check, state store, or execution
environment.

**Coding harness**
: A software-engineering application-domain profile, ranging from a local
coding agent to harnesses participating in a distributed coding platform. See
[Software engineering harnesses](domains/software-engineering/harnesses.md).

**Repository harness**
: A repository-owned, environment-side adaptation layer that makes a codebase
legible, actionable, bounded, and verifiable for coding agents. It composes
with, but need not own, a coding-agent host. See
[Repository harnesses](domains/software-engineering/repository-harnesses.md).

**Runtime topology**
: Shorthand for an arrangement of execution location, interaction mode,
continuity, and coordination. Separate those axes when the distinction
affects design or evaluation.

**Working environment**
: The systems and artifacts an agent observes and changes while working, such
as a repository, worktree, container, browser, CI system, or cloud account.

**Product archetype**
: A recognizable combination of classification axes used to describe an
offering or deployment, such as an interactive copilot, background worker,
persistent personal agent, collaborative work agent, multi-agent service, or
enterprise agent platform. See
[Harness classification](foundations/harness-classification.md).

**AI OS or agent OS**
: An overloaded market label that may refer to a personal-agent host,
enterprise control plane, multi-agent platform, or application suite. Map it
to concrete responsibilities and classification axes before using it as an
architectural category.

## Context and continuity

**Context**
: Information available to the agent for its current decisions, including
instructions, task state, retrieved knowledge, observations, and feedback.

**Context source**
: An artifact or system from which context can be selected, such as a file,
search index, tool result, event stream, or memory store.

**Progressive disclosure**
: Advertising a small description or route first, then loading deeper context
only when it becomes relevant. See
[Progressive disclosure](patterns/progressive-disclosure.md).

**Context gardening**
: The recurring practice of cultivating useful context from observed work by
repairing discovery, pruning noise, and moving knowledge to the right
harness elements. See [Context gardening](practices/context-gardening.md).

**Repository context**
: Context supplied or discovered from repository-local artifacts, including
code, instructions, documentation, plans, tests, and history.

**Coding context**
: All information relevant to a software-engineering task. It can include
repository context as well as product intent, runtime state, review,
observability, and delivery information.

**Task state**
: The explicit account of a task's goals, decisions, progress, open questions,
and completion status.

**Execution state**
: Current facts about actions and environmental changes, such as what was
inspected, modified, attempted, or verified.

**Memory**
: Persisted information made available beyond the interaction in which it was
learned. Memory may be personal, domain-level, environment-local,
task-specific, or execution-derived; those scopes should not be conflated.

## Interfaces, evidence, and control

**Tool**
: An action or observation interface the agent can invoke. A tool exposes a
capability; it does not by itself define the workflow surrounding its use.

**Feedback**
: Information returned after an action that helps the agent update its
understanding, such as tool output, errors, tests, metrics, or review
findings.

**Verification**
: Establishing with appropriate evidence that an outcome or requirement holds.

**Evaluation**
: Applying cases and grading to measure the behavior or quality of a named
target across relevant tasks or conditions in support of a decision.

**Observability**
: The ability to inspect a harness run and its environment through logs,
traces, metrics, events, artifacts, and state.

**Authority**
: The actions and resources an agent is permitted to use or affect.

**Containment**
: Structural limits on the effects an agent can produce, using boundaries such
as sandboxes, isolated credentials, filesystem scopes, or network policy.

**Guardrail**
: A control that guides, checks, blocks, or escalates agent behavior. A
guardrail may be advisory and probabilistic or mechanically enforced.

## Common harness elements

**Instruction file**
: Persistent feedforward context that establishes scoped invariants, working
facts, and discovery routes. See
[Instruction files as harness elements](elements/instruction-files-as-harness-elements.md).

**Agent skill**
: A reusable workflow packaged behind routing metadata and loaded on demand,
often with references, assets, or scripts. See
[Agent skills](elements/agent-skills.md).

**Hook**
: Logic invoked automatically at a defined lifecycle event, such as before a
tool call, after an action, or before context compression.

**Knowledge artifact**
: A document or structured resource that supplies facts, explanation, or
reference material without necessarily prescribing a workflow.

**Plan**
: An explicit representation of intended work, dependencies, decisions, and
progress that can support review and continuation.

**Check**
: An executable mechanism that decides a property and returns evidence, such
as a test, linter, schema validator, policy check, or finish gate.

**Trace**
: A chronological record of model interactions, tool calls, observations, and
state transitions during a harness run.

**Receipt**
: A compact, attributable record of an action or verification result intended
for review, handoff, or audit.

[^microsoft-agent-experience]: Microsoft — The AX stack

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents

[^aws-harness-runtime]: Amazon Bedrock AgentCore — Agent harnesses and agent runtimes
