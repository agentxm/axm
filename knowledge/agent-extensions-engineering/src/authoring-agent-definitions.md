---
type: Guide
title: "Authoring agent definitions"
description: "Use when configuring a delegated agent role; bind its responsibilities, tools, inputs, and handoff to the supported host."
tags: ["subagents", "agent-definitions", "delegation", "handoff", "host"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-10-30T20:56:27Z" }
---

# Authoring agent definitions

Start with a concrete delegated responsibility. Prefer a skill when the need
is reusable guidance for the current agent. A definition is warranted when the
host supplies a separate role or execution context needed by the task.

Specify the role's inputs, allowed decisions, outputs, completion evidence,
uncertainty reporting, and escalation conditions. Declare the tools and context
needed for that responsibility. Keep permission and model choices supported by
the actual host; a field in a portable manifest does not enforce runtime access.

Define how the caller supplies the task and receives artifacts or findings.
Avoid hidden dependencies on the caller's unshared history. Bind output to the
inspected revision or data identity where freshness matters. A handoff should
identify what changed, what was checked, what remains uncertain, and who owns the
next action.

Use current host and manager schemas to render the definition. Inspect the
projection and, when authorized and supported, exercise one bounded delegation
with representative inputs and a missing-input case. Distinguish rendering from
runtime selection, execution, and result quality.

This guide covers the extension definition. Designing a multi-agent scheduler,
coordination protocol, planning system, or autonomous runtime belongs to agent
system engineering.
