---
type: Explanation
title: Agent skills
description: How agent skills package reusable workflows behind a routing description and progressively disclose instructions, resources, and deterministic helpers.
tags: [harness, skills, workflows, routing, progressive-disclosure]
status: stable
sources:
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
  - id: openai-build-skills
    resource: https://learn.chatgpt.com/docs/build-skills
    title: OpenAI — Build skills
generated: { by: "codex/gpt-5.6", at: 2026-08-09T20:48:38Z }
verified:
  - by: codex/gpt-5.6
    at: 2026-08-09T22:13:44Z
stale_after: 2027-02-09
---

# Agent skills

An **agent skill** is a reusable workflow packaged so an agent can discover it,
decide when it applies, and load only the detail needed to perform it. The open
Agent Skills format uses a directory containing a required `SKILL.md` and
optional scripts, references, and assets.[^agent-skills-spec]

This concept owns the skill's role and boundaries inside a harness. Detailed
candidate selection, authoring, evaluation, supply-chain review, host profiles,
and lifecycle operations belong to a dedicated skill-engineering body of
knowledge rather than this harness-element overview.

The important idea is not the directory name. A skill joins two jobs that
ordinary documentation leaves separate:

1. **Routing** — metadata tells the harness when this workflow is relevant.
2. **Execution** — instructions and supporting resources tell the activated
   agent how to perform it reliably.

This makes a skill an on-demand procedural element. It is more active than a
knowledge document, less fundamental than an always-on instruction, and less
deterministic than a program.

## Progressive disclosure

A skill normally participates in context in three stages:[^agent-skills-spec]

```text
name + description  →  SKILL.md body  →  referenced resources
catalog / routing      activated work     only when the step needs them
```

The first stage is small but decisive. An agent cannot use instructions it
never discovers, so the description is part of the skill's behavior rather
than merely catalog prose. It must distinguish both the intended tasks and the
adjacent tasks that should not activate the skill.

Once selected, the full instruction body enters context. Larger references,
scripts, and assets remain outside until the workflow calls for them. OpenAI's
implementation follows this same metadata-first activation model and supports
both explicit and implicit invocation.[^openai-build-skills]

## The contracts inside a skill

| Contract | Question it answers | Typical owner |
| --- | --- | --- |
| Routing | When should this skill activate? | `name` and `description` |
| Workflow | What sequence, decisions, and checks should the agent follow? | `SKILL.md` body |
| Inputs and outputs | What must be available, and what constitutes a useful result? | Body and examples |
| Resources | What deeper facts or templates are needed only sometimes? | `references/`, `assets/` |
| Determinism | Which fragile or repetitive operations should code perform? | `scripts/` |
| Environment | Which tools, permissions, runtimes, or network access are required? | Portable metadata or host configuration |

A reliable skill makes these contracts visible. A bag of tips called a skill
may be helpful prose, but it gives the harness little basis for activation,
completion, or recovery.

## Relationship to neighboring elements

| Element | Primary job | Why it is not a skill |
| --- | --- | --- |
| Instruction file | Establish always-on invariants and routes | It applies before the harness knows which workflow is needed |
| Knowledge document | Supply facts, context, or explanation | It informs cognition rather than owning a procedure |
| Tool | Provide an action or observation primitive | It can be invoked but does not define the surrounding workflow |
| Script | Execute deterministic logic | It cannot supply judgment across the whole task |
| Agent definition | Configure a role, model, tools, and authority | It defines an actor rather than one reusable job |
| Hook | Run automatically at a lifecycle event | It is event-driven rather than selected for a user goal |

A skill may use all of these. It should not absorb their responsibilities.

## Good skill boundaries

The right unit is one repeatable job with recognizable triggers and a coherent
completion condition. It may contain branches and judgment; it need not be a
single linear checklist.

Good boundaries usually have these properties:

- a user or agent can name when the workflow starts;
- the workflow produces a recognizable outcome;
- its steps and judgment recur across tasks;
- neighboring work can be excluded without a long exception list;
- supporting resources belong to the same capability and can travel with it.

A skill is too broad when its description resembles a department, discipline,
or product area. It is too narrow when it merely aliases one obvious tool call
without adding judgment, sequencing, or reusable context.

## Instructions versus scripts

Natural-language instructions are appropriate for decisions that depend on
task context: selecting an approach, interpreting evidence, or adapting to a
working environment. Scripts are appropriate when the same transformation
must be exact, repeatable, and cheaply testable.

The division should follow semantics rather than prestige:

- keep judgment in instructions;
- put deterministic mechanics in code;
- make scripts return useful evidence and actionable failures;
- disclose dependencies and side effects before the step that invokes them.

## Portability and host behavior

The Agent Skills specification standardizes the core package, but activation,
installation, tool permissions, and optional metadata still vary by host.[^agent-skills-spec]
A portable skill therefore keeps its core workflow self-contained, states real
environment requirements, and isolates host-specific configuration from the
portable instructions.

Portability does not mean lowest-common-denominator behavior. It means the
skill tells the truth about its assumptions and does not accidentally depend on
files, credentials, or sibling extensions that are present only on its author's
machine.

## Common failure modes

- **Invisible** — the routing description is vague, so relevant tasks do not
  activate the skill.
- **Over-eager** — the description omits boundaries, so the skill fires for
  adjacent work it does not own.
- **Monolithic** — every reference and edge case lives in `SKILL.md`, defeating
  progressive disclosure.
- **Non-operational** — the body explains a topic but never defines a workflow,
  outcome, or verification step.
- **Script-shaped prose** — deterministic mechanics are repeatedly improvised
  from instructions and drift between runs.
- **Hidden environment** — required tools, permissions, network access, or
  side effects appear only after execution fails.
- **Incidental coupling** — the skill relies on another local element without
  packaging or declaring that relationship.

## Related

- [Agent instruction files](../domains/software-engineering/agent-instruction-files.md)
- [System elements and boundaries](../foundations/system-elements-and-boundaries.md) —
  for progressive disclosure, context gardening, and other context-owned
  patterns a skill depends on

[^agent-skills-spec]: Agent Skills specification
[^openai-build-skills]: OpenAI — Build skills
