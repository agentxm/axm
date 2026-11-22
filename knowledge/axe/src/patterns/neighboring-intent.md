---
type: Pattern
title: "Neighboring intent"
description: "When requests share vocabulary, use the smallest difference in outcome, destination, or authority to choose the skill, and name a neighbor only when the manifests declare the relationship."
tags: ["skills", "overlapping triggers", "near miss", "scope", "mixed requests", "naming neighbors"]
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

## Naming a neighbor

A boundary written as another extension's name holds only where that extension
is installed under that name. Name another extension only when the manifests
declare the relationship. Otherwise, describe the boundary by the work that
differs.

| Declared relationship                                                                    | Name it?      | How                                                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Required: a sibling in this member's pack, when this member declares `standalone: false` | Yes           | Use its qualified identity, say what it supplies, and report it as missing when absent rather than inventing its content. |
| Recommended: a member of a pack listed in `recommendedPacks`                             | Conditionally | “If `<identity>` is installed, use it for …”. The extension still works without it.                                       |
| None                                                                                     | No            | State the outcome, input, destination, or authority that differs. A class such as “an operations-records skill” can help. |

Write an exclusion as work, such as “not for maintaining an adopted operations
corpus,” rather than as who else does it. That statement stays true in any
workspace.

A general skill can defer to a specialist without knowing it exists. Give the
general skill evidence it can inspect: “When the workspace declares a corpus
or convention for this document type, follow it, and use this skill for the
form’s craft.” A runbook request in a workspace with an adopted operations
corpus then follows that corpus, and the same request elsewhere gets the
general guidance.

A mixed request can still load both skills. When their rules conflict, such as
on how to record an unverified command, the declared workspace convention
governs the subject and the general skill governs the form. Where the
workspace declares nothing, the general skill's rule applies.

Run the invocation trial with the neighbor installed and without it, and
include a mixed request. The boundary holds when the right skill leads in both
workspaces and neither skill's text goes stale when the other is renamed or
removed.

[^figma]: Figma implementation skill, routes by deliverable and edit destination.

[^descriptions]: Agent Skills, choosing realistic negative examples.
