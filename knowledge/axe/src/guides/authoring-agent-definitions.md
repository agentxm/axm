---
type: Guide
title: "Authoring agent definitions"
description: "Decide when to delegate and what the caller must supply for the role to work independently."
tags: ["subagents", "agent-definitions", "delegation", "handoff", "host"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:08:32Z" }
sources:
  - id: research
    resource: https://github.com/craigsmitham/agent-extensions/blob/64a2a8f9f44b303971de1ef1147814b65c2f4b96/skills/research/src/SKILL.md
    title: Research skill delegation contract
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

## Ask for an independent assessment

When a second opinion matters, give a fresh reviewer the original question,
the target revision, the relevant artifacts, and the same read access and
limits. Withhold the first verdict, suspected cause, and preferred fix until
the reviewer records a judgment and the evidence for it. The research skill
uses this approach to keep the caller's favored answer out of an evidence
gatherer's brief.[^research]

For a skill review, both reviewers might receive the same candidate archive
and the question “Can an installer follow the migration link?” Compare their
recorded answers, including which file each inspected. If the assignment is
to verify a _specific reported finding_, supply that finding up front so the
second reviewer knows which claim to check.

[^research]: Research skill, phase selection and delegation contract.
