---
type: Explainer
description: How AGENTS.md supplies repository-scoped instructions to coding agents without defining reusable capabilities.
tags: [agents-md, instructions, coding-agents]
status: stable
generated:
  by: openai/codex
  at: 2026-08-14T00:43:46Z
sources:
  - id: convention
    resource: https://agents.md/
    title: AGENTS.md
---

# AGENTS.md

`AGENTS.md` is an open convention for giving coding agents the project context
and instructions they need to work in a repository.[^convention] It is ordinary
Markdown in a predictable filename—effectively a README for agents.

A repository can place one file at its root and additional files in
subdirectories. For work beneath a nested file, the closest `AGENTS.md` takes
precedence; an explicit user instruction still overrides repository guidance.

## What the convention provides

`AGENTS.md` gives different coding agents a shared place to find build commands,
testing expectations, code conventions, repository structure, and other local
working guidance. It deliberately does not prescribe headings or a detailed
schema.

The convention does not package reusable capabilities, install tools, enforce
policy, or guarantee that an instruction is correct. It also does not define a
registry, distribution mechanism, or ownership protocol. The repository owns
the file and the meaning of its instructions.

## Relationship to neighboring standards

`AGENTS.md` is project-scoped guidance. An [Agent Skill](agent-skills.md) is a
reusable capability an agent may apply across projects. An
[OKF](open-knowledge-format.md) bundle is reference knowledge opened on demand,
not an instruction file. These forms may refer to one another, but they have
different authority and loading behavior.

## Relationship to AgentXM

AgentXM Rules can manage rule-oriented guidance within the workspace's agent
instruction surface. AgentXM must preserve user-owned instructions outside the
content it owns. The AGENTS.md convention remains authoritative for the file's
portable meaning; AXM architecture and behavior tests own its management and
collision rules.

[^convention]: AGENTS.md project site.
