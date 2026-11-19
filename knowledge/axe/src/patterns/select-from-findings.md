---
type: Pattern
title: "Select from findings"
description: "When several findings can be addressed independently, let the user choose which ones enter remediation."
tags: ["skills", "review", "selection", "findings", "remediation"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:12:18Z" }
sources:
  - id: threads
    resource: https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/gh-address-comments/SKILL.md
    title: OpenAI PR comment handler
  - id: review
    resource: https://impeccable.style/docs/critique/
    title: Impeccable critique
  - id: improve
    resource: https://github.com/craigsmitham/agent-extensions/blob/5a4d1e8697800e0b313545457bb84cb2aaa92344/skills/improve-whatever/src/SKILL.md
    title: Improve whatever
---

# Select from findings

OpenAI's PR comment handler numbers review threads, summarizes the work each fix would require, and asks which to address. Impeccable's critique also lets the reader choose fixes after seeing their effects on the task.[^threads][^review]

Give each finding a short handle, its location, and the consequence of leaving it open. Keep the association between the displayed handle and its underlying thread, artifact, or finding ID. For example, “2. Missing migration guide blocks installers” can point to the packaging finding even if a new high-priority item moves it down the list.

Resolve the reply against the list the user saw. If the selected finding disappeared or its evidence changed materially, report that change before acting on it. Explain a dependency if selecting one fix also requires another. When the original request already specifies the working set, carry that scope forward directly.

Pair item selection with [selectable next actions](selectable-next-actions.md)
when the user can inspect as well as repair. Use letters for actions and
numbers for findings in the prompt menu. If A means “Apply selected,” then
“A 2,” “apply 2,” and choosing **Apply selected** followed by **2 · Missing
migration guide** in the picker all request the same change. Show both number
and title in the item picker. Ask only for the part still missing.

When remedies have materially different consequences, give each a letter
within its finding.[^improve] Suppose the migration instructions are already
in the release guide. For finding 2, show **2a (Recommended) · Link to the
existing instructions** and **2b · Ship a standalone migration guide**.
`A 2` and `apply 2` select the recommendation. `apply 2b` selects the
standalone guide in one reply. Bind the suffix to the option the reader saw.
A finding with one remedy needs only its number.

Try selecting 2 and 4, then reorder the list and resolve one of the two findings independently. Only the still-open selected finding should receive a fix. A [handoff artifact](workflow-handoff-artifact.md) can carry those decisions into another session.

[^threads]: OpenAI, numbered review threads and selective fixes.

[^review]: Impeccable, choosing which critique findings to act on.

[^improve]: Improve whatever, selecting an alternative remedy by reply.
