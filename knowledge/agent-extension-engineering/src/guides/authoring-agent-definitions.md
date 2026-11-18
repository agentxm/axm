---
type: Guide
title: "Authoring agent definitions"
description: "Decide when to delegate and what the caller must supply for the role to work independently."
tags: ["subagents", "agent-definitions", "delegation", "handoff", "host"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T22:24:31Z" }
---

# Authoring agent definitions

Use an agent definition when the task benefits from a separate context or tool
set. A skill suffices when the current agent already has the right context and
only needs a procedure.

For a read-only diff reviewer, have the caller supply the base, candidate
revision, and review scope. Give the role tools to inspect those revisions.
Return findings tied to the candidate so the caller can tell whether they
still apply after another edit. If the base is missing, the reviewer should
surface that gap before attributing a defect to the change.

Try the handoff in the intended host with only the inputs the caller promises.
This exposes reliance on unshared conversation history and shows which tools
the role actually receives.
