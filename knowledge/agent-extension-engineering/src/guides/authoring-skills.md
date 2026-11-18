---
type: Guide
title: "Authoring and revising skills"
description: "Resolve overlapping skill triggers and decide how much procedure belongs in the skill."
tags: ["skills", "skill.md", "author", "revise", "routing", "progressive-disclosure"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:13:12Z" }
sources:
  - id: writing
    resource: https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/writing-skills/SKILL.md
    title: Superpowers writing skills
  - id: example
    resource: https://github.com/vercel-labs/agent-skills/blob/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices/rules/async-defer-await.md
    title: Vercel React best practices worked example
---

# Authoring and revising skills

Start with a request and the result the user should get. Put the cues that
distinguish that job in the description. In the body, spell out decisions
where a plausible choice would produce the wrong result. Give exact steps
where order matters. If only one task needs a reference, link it at the step
where the reader needs it.

Suppose a code reviewer and a release-note editor both activate on “review this
change.” Look at what the user supplied and what each skill would return.

- A diff and a request for defects belong with the code reviewer. A draft and
  a request to clarify user-visible changes belong with the editor. Narrow each
  description around its input and outcome.
- A request to find defects **and** revise the release note has two deliverables.
  Keep both skills available. An exclusion on the word “review” would hide a
  useful skill.
- If both skills take the same draft and return the same edit under the same
  constraints, merge them unless a caller needs the distinction.

Try a fresh wording of the ambiguous request with each kind of input. Inspect
which skill was selected and whether its answer delivered the intended result.

Within a skill, the same action can have several targets. For “review this
skill,” a supplied source draft calls for an authoring review, a native path
and a missing update call for inspecting the projection, and a transcript
with an unexpected answer calls for examining that run. Honor the named target
first. When it is implicit, inspect only enough context to distinguish the
deliverables. Keep a scope such as “just the description” on the selected
route. If two plausible targets still lead to different work, pose the
[decision](../patterns/agent-mediated-decisions.md) in the user's terms.

Before revising a skill, find where an actual run went wrong.[^writing] If
the agent never opened the review guide, examine the routing cue. If it read
the guide, found the defect, and omitted the repair location, change the example
or add a location field to the finding. When it took the wrong branch, name
the observable condition that distinguishes the two routes.

A pair of examples can isolate the missing detail.[^example] “The migration
link is broken” gives the editor a symptom. “In the authored `SKILL.md`, change
`migration.md` to the shipped filename `migrations.md`” gives the editor a
place to act. Retry the original task and a fresh variant to see whether
the revision fixes that omission.

[^writing]: Superpowers writing skills, selecting guidance for the observed failure.

[^example]: Vercel React best practices, paired examples for deferring an await.
