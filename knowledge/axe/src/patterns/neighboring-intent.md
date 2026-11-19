---
type: Pattern
title: "Neighboring intent"
description: "When requests share vocabulary, use the smallest difference in outcome, destination, or authority to choose the skill."
tags: ["skills", "overlapping triggers", "near miss", "scope", "mixed requests"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:27:49Z" }
sources:
  - id: figma
    resource: https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/figma-implement-design/SKILL.md
    title: OpenAI Figma implementation skill
  - id: descriptions
    resource: https://agentskills.io/skill-creation/optimizing-descriptions
    title: Agent Skills description evaluation
---

# Neighboring intent

Pair a request the skill should handle with the closest request that should
go elsewhere. Hold the subject matter steady. In “implement this Figma
screen in my repository” and “edit this screen in Figma,” both the screen
and the design vocabulary match. The destination of the edit selects the
workflow.[^figma]

Apply the same exercise to two skills that both respond to “review this
change.” A diff and a request for defects select the code reviewer. A draft
and a request to clarify user-visible changes select the release-note editor.
Within one skill, “find the broken link” and “fix the broken link” distinguish
an inspection from an authorized edit.

Try a mixed request too. “Find the defects and revise the release note” has
two deliverables. A blanket exclusion on “review” would hide a useful skill.
If two skills take the same input and produce the same result under the same
constraints, consider combining them. If their responsibilities overlap only
on some requests, [trace one through both skills](../guides/extension-sets.md#trace-a-request)
to decide whether to narrow a trigger or keep a handoff. Keep a near miss for the next
[invocation trial](invocation-trial.md).[^descriptions]

[^figma]: Figma implementation skill, routes by deliverable and edit destination.

[^descriptions]: Agent Skills, choosing realistic negative examples.
