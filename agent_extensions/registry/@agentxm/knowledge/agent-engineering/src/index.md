---
okf_version: "0.2"
---

# Agent engineering

Portable knowledge for building goal-directed AI agent systems: deciding when
an agent is the right shape at all, designing its behavior, shaping what the
model sees, building the runtime around it, measuring whether it works, and
operating it over time.

The scope is foundation-model software agents. Robotics, autonomous vehicles,
and reinforcement learning are neighboring fields rather than covered domains.

## Start here

- [Foundations](foundations/) - What the discipline covers, how agent systems
  compose, how autonomy and risk are classified, and which surface owns which
  concern.

## Design the agent's behavior

- [Agent design](agents/) - Goals, control loops, planning, observation and
  tool-use policy, memory policy, and human collaboration.
- [Multi-agent systems](multi-agent/) - Roles, topologies, delegation,
  handoffs, coordination, and failure containment.

## Shape what the model sees

- [Prompts](prompts/) - Model-facing instructions, contracts, templates,
  examples, presentation, and prompt robustness.
- [Context](context/) - Selection, authority, progressive disclosure,
  instruction files, memory, compaction, and gardening.

## Build the system around the agent

- [Harness](harness/) - Runtime, environments, action and observation
  interfaces, state, feedback, authority, and containment.
- [Skills](skills/) - Packaging reusable workflows behind routing metadata,
  with resources, contracts, portability, and platform profiles.

## Measure it and trust it

- [Evaluation](evaluation/) - Contracts, task distributions, graders, trials,
  uncertainty, validity, and the specialized evidence each surface owes.
- [Trust](trust/) - Threat models, identity and authority, provenance, and
  permission boundaries.

## Operate it

- [Operations](operations/) - Reliability, failure attribution, observability,
  improvement, retirement, and library governance.

## Apply it to a domain

- [Application domains](domains/) - Specializations of the general material for
  particular kinds of work.

## Shared vocabulary

- [Glossary](glossary.md) - Working definitions for agency, control, system
  composition, context, interfaces, authority, harness elements, and
  evaluation.
