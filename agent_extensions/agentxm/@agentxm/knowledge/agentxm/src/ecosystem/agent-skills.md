---
type: Explainer
description: How Agent Skills give coding agents portable, task-specific instructions and supporting resources.
tags: [agent-skills, skills, interoperability]
status: stable
generated:
  by: openai/codex
  at: 2026-08-14T00:43:46Z
sources:
  - id: overview
    resource: https://agentskills.io/home
    title: Agent Skills overview
  - id: specification
    resource: https://agentskills.io/specification
    title: Agent Skills specification
---

# Agent Skills

Agent Skills is an open format for giving agents reusable capabilities and
task-specific expertise.[^overview] A skill is a directory with a required
`SKILL.md` file and optional scripts, references, assets, and other supporting
files.[^specification]

The required file combines small discovery metadata with Markdown instructions.
Its name and description help an agent decide when the skill applies; its body
explains how to perform the work. Supporting files let detailed material remain
available without putting everything in the main instructions.

## What the format provides

Agent Skills provides a portable content boundary that multiple agent clients
can recognize. It standardizes the directory's essential shape and the core
`SKILL.md` fields while leaving authors free to write the instructions their
task requires.

The format does not provide a registry, versioning system, dependency model,
permission system, or execution sandbox. The presence of a script says that it
is available to the agent; it does not by itself authorize or secure its
execution. Each client decides how skills are discovered, activated, presented,
and run.

## Relationship to neighboring standards

An Agent Skill teaches an agent how to do something. It is different from:

- [AGENTS.md](agents-md.md), which gives project-scoped guidance to agents
  working in a repository;
- [MCP](model-context-protocol.md), which connects an AI application to live
  tools and data through a protocol; and
- [Agent Plugins](agent-plugins.md), which can place one or more Agent Skills
  inside a larger portable plugin.

## Relationship to AgentXM

Agent Skills is the governing portable content format for an AgentXM Skill.
AgentXM adds registry identity, immutable extension versions, distribution, and
workspace management around that content. Those AgentXM concerns do not change
the meaning of the upstream `SKILL.md` format.

[^overview]: Agent Skills overview.

[^specification]: Agent Skills specification.
