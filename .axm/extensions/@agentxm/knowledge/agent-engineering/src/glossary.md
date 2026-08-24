---
type: Reference
title: Agent engineering glossary
description: Working vocabulary for agency, control loops, system composition, context, interfaces, authority, harness elements, and evaluation.
tags:
  [
    terminology,
    vocabulary,
    agency,
    autonomy,
    harness,
    context,
    tools,
    memory,
    delegation,
    oversight,
    evaluation,
    eval-suite,
    trial,
    grader,
    trajectory,
  ]
status: stable
sources:
  - id: agent-survey
    resource: https://arxiv.org/abs/2308.11432
    title: A Survey on Large Language Model based Autonomous Agents
  - id: anthropic-agents
    resource: https://www.anthropic.com/engineering/building-effective-agents
    title: Anthropic — Building effective agents
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: microsoft-agent-experience
    resource: https://developer.microsoft.com/blog/the-ax-stack-whats-fixed-where-you-can-win
    title: Microsoft — The AX stack
  - id: qualitymd-agent-mediated-ux
    resource: https://github.com/qualitymd/quality.md/blob/f0c50e2faa8fb36e1faed62dce2dbfebee5d5511/docs/guides/agent-mediated-ux.md
    title: QUALITY.md — Designing agent-mediated UX
    author: human:craigsmitham
  - id: aws-harness-runtime
    resource: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-vs-runtime.html
    title: Amazon Bedrock AgentCore — Agent harnesses and agent runtimes
generated: { by: "codex/gpt-5.6", at: 2026-08-22T01:17:48Z }
stale_after: 2027-02-21
---

# Agent engineering glossary

This glossary establishes the working vocabulary for the whole bundle. Product
ecosystems may use the same words differently; individual concept documents
explain the important distinctions and tradeoffs. For how responsibility
divides across behavior, prompts, context, harness, skills, and evaluation, see
[System elements and boundaries](foundations/system-elements-and-boundaries.md).

## Agency and control

**Agent**
: A software actor in which a model dynamically selects at least some next
actions from observations while pursuing a goal.

**Agentic workflow**
: A predefined workflow containing one or more steps whose internal path is
selected dynamically by a model.

**Workflow**
: An inspectable execution definition whose primary control path, dependencies,
retries, and lifecycle are specified outside model discretion.

**Autonomy**
: The degree of decision freedom exercised without prior human selection,
considered together with authority, duration, supervision, reversibility,
and consequence.

**Control loop**
: The repeated observation, decision, action, and feedback cycle through which
an agent pursues and revises progress toward a goal.

**Goal contract**
: The outcome, responsibilities, constraints, evidence, stop conditions, and
escalation conditions that define the agent's assignment.

**Plan**
: An explicit, revisable commitment about intended intermediate outcomes,
actions, dependencies, and progress. It can support review, continuation, and
handoff; it is not a demand to expose hidden chain-of-thought.

**Tool-use policy**
: Behavioral rules for when, why, and in what sequence an agent selects
capabilities and interprets their results.

**Memory policy**
: Rules for what information may influence later decisions, at what scope,
with what provenance and expiry; storage is a harness concern.

**Delegation**
: Assigning a bounded responsibility and authority to another actor while
retaining an explicit acceptance, escalation, or return path.

**Handoff**
: A transfer of responsibility accompanied by the goal, relevant state,
authority, expected artifact, acceptance conditions, and unresolved risks.

**Human oversight**
: The means by which people understand, direct, approve, interrupt, correct,
or stop agent behavior and remain accountable for deployment decisions.

Anthropic's practical distinction is useful: workflows follow predefined code
paths, while agents dynamically direct their process and tool
use.[^anthropic-agents] Survey taxonomies commonly decompose an agent into
planning, memory, action, and a profile or role, but the engineering boundary
also includes human control, trust, operations, and lifecycle.[^agent-survey]

## System composition

**Agent system**
: The complete operating composition that turns intent into actions and
outcomes, potentially including an agent, harness core, adapted environment,
runtime substrate, orchestration, and governance. See
[Agent-system composition](foundations/agent-system-composition.md).

**Agent harness**
: The concrete system that mediates among an agent, a task, and a working
environment. It may provide context, tools, runtime, state, feedback, and
controls.

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
: A product or internal service that supplies reusable runtime, orchestration,
governance, observability, or integration facilities for multiple agent
systems. The label does not imply that every layer is present.

**Working environment**
: The systems and artifacts an agent observes and changes while working, such
as a repository, worktree, container, browser, CI system, or cloud account.

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

**Runtime topology**
: Shorthand for an arrangement of execution location, interaction mode,
continuity, and coordination. Separate those axes when the distinction
affects design or evaluation.

**Product archetype**
: A recognizable combination of classification axes used to describe an
offering or deployment, such as an interactive copilot, background worker,
persistent personal agent, collaborative work agent, multi-agent service, or
enterprise agent platform. See
[Harness classification](harness/harness-classification.md).

**Coding harness**
: A software-engineering application-domain profile, ranging from a local
coding agent to harnesses participating in a distributed coding platform. See
[Software engineering harnesses](domains/software-engineering/harnesses.md).

**Repository harness**
: A repository-owned, environment-side adaptation layer that makes a codebase
legible, actionable, bounded, and verifiable for coding agents. It composes
with, but need not own, a coding-agent host. See
[Repository harnesses](domains/software-engineering/repository-harnesses.md).

**AI OS or agent OS**
: An overloaded market label that may refer to a personal-agent host,
enterprise control plane, multi-agent platform, or application suite. Map it
to concrete responsibilities and classification axes before using it as an
architectural category.

**Agent experience (AX)**
: An emerging lens on how effectively an agent can operate with a technology,
harness, and working environment. It includes discoverability and legibility,
tool affordances, feedback quality, authority, continuity, and
recovery.[^microsoft-agent-experience]

**Agent-mediated user experience**
: The human-facing experience of a product, workflow, or task as conveyed
through an agent's openings, progress, questions, choices, confirmations,
results, and handoffs. It concerns the person's interaction through the
agent; agent experience concerns how effectively the agent itself can
operate.[^qualitymd-agent-mediated-ux] See
[How to design agent-mediated user experience](agents/agent-mediated-user-experience.md).

**Agent legibility**
: The degree to which a harness and working environment render task-relevant
intent, state, capabilities, constraints, and consequences discoverable and
usable by an agent. It is one dimension of agent experience. See
[Agent legibility](foundations/agent-legibility.md).

## Context and continuity

**Context**
: Information represented and made available for current decisions, including
instructions, task state, observations, history, retrieved knowledge, and
feedback.

**Context source**
: An artifact or system from which context can be selected, such as a file,
search index, tool result, event stream, or memory store.

**Progressive disclosure**
: Advertising a small description or route first, then loading deeper context
only when it becomes relevant. See
[Progressive disclosure](context/progressive-disclosure.md).

**Context gardening**
: The recurring practice of cultivating useful context from observed work by
repairing discovery, pruning noise, and moving knowledge to the right
harness elements. See [Context gardening](context/context-gardening.md).

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

## Harness elements

**Harness element**
: An identifiable constituent used to shape or operate a harness, such as an
instruction file, skill, tool, hook, check, state store, or execution
environment.

**Agent instruction file**
: Persistent feedforward context that a harness loads for a scope, establishing
invariants, working facts, and discovery routes. See
[Agent instruction files](domains/software-engineering/agent-instruction-files.md).

**Agent skill**
: A reusable workflow packaged behind routing metadata and loaded on demand,
often with references, assets, or scripts. See
[Agent skills](skills/agent-skills.md).

**Hook**
: Logic invoked automatically at a defined lifecycle event, such as before a
tool call, after an action, or before context compression.

**Knowledge artifact**
: A document or structured resource that supplies facts, explanation, or
reference material without necessarily prescribing a workflow.

**Check**
: An executable mechanism that decides a property and returns evidence, such
as a test, linter, schema validator, policy check, or finish gate.

**Receipt**
: A compact, attributable record of an action or verification result intended
for review, handoff, or audit.

## Evaluation

**Evaluation**
: A complete measurement system that applies cases and grading to a named
target to support a decision.

**Task or case**
: One defined input, fixture set, and set of success conditions.

**Trial**
: One attempt at one case under a recorded configuration.

**Transcript, trace, or trajectory**
: The chronological record of model interactions, tool calls, observations,
state transitions, and intermediate results from a run or trial.

**Outcome**
: The final externally observable state or artifact produced by a trial.

**Grader**
: Logic or judgment that maps evidence to a score, label, or disposition.

**Metric**
: A defined quantity produced or consumed by evaluation; not the evaluation by
itself.

**Evaluation suite**
: A purposeful collection of cases measuring related capabilities or risks.

**Evaluation harness**
: Infrastructure that provisions and runs trials, captures evidence, invokes
graders, and aggregates results. It is distinct from the agent harness being
evaluated, though an evaluation run may contain both.[^anthropic-evals]

**Baseline**
: The named target or prior evidence against which a candidate is compared.

**Slice**
: A meaningful subset of results used to reveal behavior hidden by aggregation.

**Agent-specific evaluation obligation**
: A behavior, risk, trajectory, or scenario the agent design requires an
evaluation system to measure using general evaluation methods.

Anthropic uses the task, trial, grader, transcript, outcome, evaluation
harness, agent harness, and suite distinctions for agent
evaluations.[^anthropic-evals]

[^agent-survey]: A Survey on Large Language Model based Autonomous Agents

[^anthropic-agents]: Anthropic — Building effective agents

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents

[^microsoft-agent-experience]: Microsoft — The AX stack

[^qualitymd-agent-mediated-ux]: QUALITY.md — Designing agent-mediated UX

[^aws-harness-runtime]: Amazon Bedrock AgentCore — Agent harnesses and agent runtimes
