---
type: Reference
title: Prompt, agent, context, harness, skill, and evaluation boundaries
description: Which behavioral, model-facing, informational, runtime, packaged-workflow, or assurance discipline owns each failure and evidence surface.
tags:
  [
    prompt-engineering,
    agent-engineering,
    context-engineering,
    harness-engineering,
    skill-engineering,
    eval-engineering,
    ownership,
  ]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
---

# Prompt, agent, context, harness, skill, and evaluation boundaries

Prompt engineering is a technique within the informational part of an agent
system, but it is used by more than one artifact type. Assign ownership by the
smallest surface whose change can explain and repair the observed failure.

| Discipline             | Owns                                                                                                                           | Representative evidence                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Prompt engineering     | Intentional instructions, examples, templates, and response contracts                                                          | Controlled prompt variants and response grading                             |
| Agent engineering      | Agency choice, goals, control loops, planning, capability and memory policy, delegation, recovery, stopping, and human control | Agent trajectories, external effects, interventions, and stopping behavior  |
| Context engineering    | Selection, provenance, ordering, routing, loading, compaction, and retirement of all information in attention                  | Retrieval, ablation, freshness, and context-use evidence                    |
| Harness engineering    | Model invocation, tool implementation, runtime, persistence, mechanical feedback, validation, permissions, and enforcement     | End-to-end traces, environment state, control decisions, and outcome checks |
| Skill engineering      | Discoverable workflow packaging, routing, resources, execution contract, trust, admission, and lifecycle                       | Routing and activated-workflow evaluations                                  |
| Evaluation engineering | Objectives, task distributions, trials, graders, baselines, uncertainty, aggregation, validity, and suite lifecycle            | Attributable reports bound to target and evaluation identities              |

Anthropic distinguishes prompt methods for writing and organizing instructions
from context engineering, which curates all tokens available during inference,
including tools, history, and external data.[^anthropic-context] It also
distinguishes a response or transcript from the environment outcome an agent
claims to have produced.[^anthropic-evals]

## Shared concerns, different owners

| Concern                 | Prompt responsibility                                                          | Neighbor responsibility                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Variables               | Declare meaning, type, and expected placement                                  | Context selects and supplies values; harness renders safely                                                   |
| Tool use                | Express capability semantics, inputs, results, and model-facing error guidance | Agent engineering owns selection and recovery policy; harness implements, authorizes, executes, and validates |
| Stopping and escalation | Express the conditions and expected response                                   | Agent engineering owns the behavioral policy; harness enforces hard limits and approval gates                 |
| Handoffs                | Express responsibility and state to the receiving model                        | Agent engineering owns delegation and acceptance; harness dispatches and transfers durable state              |
| Output schema           | State semantic fields and interaction requirements                             | Structured-output or validation code enforces syntax                                                          |
| Safety                  | Communicate role, limits, and escalation behavior                              | Harness enforces least privilege, approvals, isolation, and monitoring                                        |
| Evaluation              | Define prompt-specific behavior and preserve rendered prompt identity          | Evaluation engineering owns general measurement method; target disciplines define their specialized evidence  |
| Versioning              | Version prompt content and its compatibility evidence                          | Each neighboring artifact versions its own configuration and lifecycle                                        |

No layer should absorb another merely because all of them ultimately influence
model behavior.

[^anthropic-context]: Anthropic — Effective context engineering for AI agents

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
