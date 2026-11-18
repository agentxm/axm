---
type: Pattern
title: "CLI-backed skill"
description: "When a skill drives a CLI, give the command ownership of effects and the skill responsibility for interpreting the request."
tags: ["skills", "cli", "ownership", "judgment", "resume"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:13:12Z" }
sources:
  - id: quality
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/skills/quality/workflows/evaluate.md
    title: Quality evaluation workflow
  - id: axm
    resource: https://github.com/agentxm/axm/blob/abe5a94f2220b3f59f1d273a0d21258dd60ce64f/docs/architecture/extension-enablement.md
    title: Agent extension enablement architecture
  - id: server
    resource: https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/webapp-testing/SKILL.md
    title: Anthropic web-app testing skill
  - id: jupyter
    resource: https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/jupyter-notebook/SKILL.md
    title: OpenAI Jupyter notebook skill
  - id: creator
    resource: https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/skill-creator/SKILL.md
    title: Anthropic skill creator
---

# CLI-backed skill

A user can ask to edit an installed skill without knowing who owns the file
their agent reads. The AXM skill interprets the requested edit. The CLI can
identify the canonical source and report who owns it. This division lets the
agent explain the available action using the same facts a person can inspect
at the terminal.[^axm]

A command can be a small helper shipped inside the skill. Anthropic’s web-app
testing helper starts and stops the local servers. The agent chooses which
browser behavior to test.[^server] OpenAI’s notebook helper builds the file
from a template, leaving the experiment or lesson to the author.[^jupyter]
Look at several runs. If each writes nearly the same helper, extract the
repeated operation after checking for an existing command that already owns
it.[^creator] Keep choices that vary with the user's request in the skill.

The division also works across a long-running task. In the quality skill, the
agent resolves which part of a project the user wants evaluated. The CLI plans
the work, records accepted results, and builds the report. When the current
agent serves as evaluator, the runner supplies a bounded question, evidence
scope, and expected result. After an interruption, the agent can ask the
runner for the outstanding work.[^quality]

Sketch the handoff for your own skill. What choice requires conversation or
judgment? Which command can perform the operation and report its actual
effects? If the conversation ended after an effect took place, how would the
next agent learn what happened before retrying? Prefer an existing structured
result when the next decision depends on it. Keeping a second account of
completed work in the prompt gives the two accounts a chance to disagree.

A lookup such as identifying an edit owner can end with one command. Durable
checkpoints earn their cost when there is partial work to recover. For a
self-contained writing task, a skill can often produce the requested draft
directly.

[^quality]: Quality evaluation workflow, procedure for servicing harness checkpoints.

[^axm]: Agent extension enablement architecture, responsibilities of the CLI and AXM skill.

[^server]: Anthropic web-app testing skill, server lifecycle helper.

[^jupyter]: OpenAI Jupyter notebook skill, scaffolding from a template.

[^creator]: Anthropic skill creator, reviewing repeated work across trials.
