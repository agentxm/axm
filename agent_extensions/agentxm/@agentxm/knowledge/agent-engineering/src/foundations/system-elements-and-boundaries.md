---
type: Reference
title: System elements and boundaries
description: Which surface of an agent system owns each concern, and how behavior, prompts, context, harness, skills, and evaluation divide responsibility without absorbing one another.
tags: [boundaries, ownership, agent-systems, prompts, context, harness, skills, evaluation, failure-attribution]
status: stable
generated: { by: "claude/opus-5", at: 2026-08-17T00:00:00Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: anthropic-agents
    resource: https://www.anthropic.com/engineering/building-effective-agents
    title: Anthropic — Building effective agents
  - id: openai-sdk
    resource: https://openai.github.io/openai-agents-python/
    title: OpenAI Agents SDK
  - id: openai-harness
    resource: https://openai.com/index/harness-engineering/
    title: OpenAI — Harness engineering
---

# System elements and boundaries

An agent system has several engineering surfaces. They influence one another
constantly, but each failure still needs one accountable design surface.

Assign responsibility to the smallest surface whose design can explain and
repair the observed behavior. Influence is shared; ownership should not be.

## The surfaces

| Surface | Owns | Representative evidence |
| --- | --- | --- |
| [Agent behavior](../agents/) | Agency choice, goals, control loops, planning, capability and memory policy, delegation, recovery, stopping, and human control | Agent trajectories, external effects, interventions, and stopping behavior |
| [Prompts](../prompts/) | Intentional instructions, examples, templates, and response contracts | Controlled prompt variants and response grading |
| [Context](../context/) | Selection, provenance, ordering, routing, loading, compaction, and retirement of all information in attention | Retrieval, ablation, freshness, and context-use evidence |
| [Harness](../harness/) | Model invocation, tool implementation, runtime, persistence, mechanical feedback, validation, permissions, and enforcement | End-to-end traces, environment state, control decisions, and outcome checks |
| [Skills](../skills/) | Discoverable workflow packaging, routing, resources, execution contract, trust claims, admission criteria, and behavioral lifecycle | Routing and activated-workflow evaluations |
| Extension management | Canonical package authority, manifests, projections, composition graphs, installation, activation, distribution, and registry lifecycle | Desired and resolved state, package identities, projection health, and lifecycle transactions |
| [Evaluation](../evaluation/) | Objectives, task distributions, trials, graders, baselines, uncertainty, aggregation, validity, and suite lifecycle | Attributable reports bound to target and evaluation identities |

Anthropic distinguishes prompt methods for writing and organizing instructions
from context engineering, which curates all tokens available during inference,
including tools, history, and external data.[^anthropic-context] It also
distinguishes a response or transcript from the environment outcome an agent
claims to have produced.[^anthropic-evals]

## Shared concerns

| Concern | Behavioral owner | Neighboring mechanism |
| --- | --- | --- |
| Goal and completion | Agent behavior defines outcome, responsibility, evidence, stopping, escalation | Prompt expresses; harness enforces hard limits and captures evidence |
| Planning and recovery | Agent behavior defines decisions, replanning, retry, fallback, escalation | Harness reports failure and applies budgets or limits |
| Observation | Agent behavior defines what evidence decisions require | Harness exposes signals; context selects and represents them |
| Memory | Agent behavior defines what may influence later behavior | Context owns provenance, scope, freshness, compaction, retirement; harness persists |
| Tool use | Agent behavior defines when, why, and how capability is selected | Harness implements, authorizes, executes, and validates; prompt describes semantics and error guidance |
| Stopping and escalation | Agent behavior owns the policy | Prompt expresses the conditions; harness enforces hard limits and approval gates |
| Delegation and handoff | Agent behavior defines actors, responsibilities, authority, artifacts, acceptance | Harness dispatches and transfers durable state; prompt carries model-facing wording |
| Variables and templating | Prompt declares meaning, type, and expected placement | Context selects and supplies values; harness renders safely |
| Output schema | Prompt states semantic fields and interaction requirements | Structured-output or validation code enforces syntax |
| Safety and authority | Prompt communicates role, limits, and escalation behavior | Harness enforces least privilege, approvals, isolation, and monitoring |
| Durable process | Agent behavior owns dynamic choices inside an agent step | Workflow automation owns schedules, dependencies, retries, cancellation, compensation |
| Reusable job | Agent behavior may select or delegate a job | Skills own routing and the packaged procedure; extension management owns canonical packaging, projection, composition, and distribution state |
| Evaluation | Each surface defines the behaviors, risks, and scenarios that matter to it | Evaluation owns sampling, trials, graders, uncertainty, validity, and reporting |
| Versioning | Each artifact declares its public contract and version intent | Extension management validates, changes, resolves, and distributes package versions; governance separately owns approval |

No surface should absorb another merely because all of them ultimately
influence model behavior.

## Context is one responsibility, not the whole harness

Context shapes the informational environment an agent receives, discovers,
produces, and carries through a task: selection, authority, routing, retrieval,
memory, compaction, and information lifecycle.[^anthropic-context]

That is one responsibility within the harness, not a synonym for it. Context
can help an agent decide, but it does not provision an execution environment,
enforce a permission boundary, execute an effect, or prove that an external
outcome occurred.[^openai-harness] Prompts are narrower still: they design
model-facing instructions and inputs at particular interaction surfaces, while
the harness decides when and how those prompts are composed alongside tools,
state, runtime, feedback, and controls.

## Instruction files cross three surfaces

An instruction file is a persistent context surface a harness loads for some
scope. It can establish invariants, operating facts, collaboration agreements,
and routes to deeper material.

- The harness owns the mechanism: discovery, composition, precedence, scope
  enforcement, observability, and integration with executable controls.
- Context owns what information belongs there, how it competes for attention,
  and how it stays current.
- Prompts may inform the wording and structure when the file is rendered
  directly into a model-facing prompt.

Do not treat an instruction file as the harness itself. It cannot enforce
permissions, provision dependencies, preserve execution state, or establish
that an action succeeded.

## Cross-surface changes

An SDK may package agents, tools, loops, handoffs, guardrails, sessions,
human-in-the-loop controls, and tracing together.[^openai-sdk] Product
co-location does not erase the conceptual boundaries: each failure still needs
an accountable design surface. The same holds for practitioner patterns that
combine routing, parallel workers, evaluators, and agents in one
implementation.[^anthropic-agents]

Use cross-surface changes when evidence shows several surfaces jointly caused a
failure, but state each change's responsibility. Avoid "the agent" as a label
for the entire application, platform, harness, or workflow graph.

[^anthropic-context]: Anthropic — Effective context engineering for AI agents
[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
[^anthropic-agents]: Anthropic — Building effective agents
[^openai-sdk]: OpenAI Agents SDK
[^openai-harness]: OpenAI — Harness engineering
