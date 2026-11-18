---
type: Pattern
title: "CLI-backed skill"
description: "When a skill drives a CLI, give the command ownership of effects and the skill responsibility for interpreting the request."
tags: ["skills", "cli", "ownership", "judgment", "resume"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:06:15Z" }
sources:
  - id: quality
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/skills/quality/workflows/evaluate.md
    title: Quality evaluation workflow
  - id: axm
    resource: https://github.com/agentxm/axm/blob/abe5a94f2220b3f59f1d273a0d21258dd60ce64f/docs/architecture/extension-enablement.md
    title: Agent extension enablement architecture
---

# CLI-backed skill

A user can ask to edit an installed skill without knowing who owns the file
their agent reads. The AXM skill interprets the requested edit. The CLI can
identify the canonical source and report who owns it. This division lets the
agent explain the available action using the same facts a person can inspect
at the terminal.[^axm]

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
