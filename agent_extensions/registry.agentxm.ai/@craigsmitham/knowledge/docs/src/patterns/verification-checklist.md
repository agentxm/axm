---
type: Pattern
title: Verification checklist
description: When completed work may contain omissions or incorrect states, compare observable evidence with explicit criteria and route discrepancies to correction or escalation.
tags: [docs, documentation-pattern, checklist, verification, do-confirm, challenge-response, evidence, authoring]
status: draft
sources:
- id: checklist-design-origin
  resource: https://github.com/craigsmitham/agent-extensions/blob/156c3d4346bee6874ab3d356c19446cf6425713b/skills/checklist-design/src/references/interaction-and-item-design.md
  title: Craig Smitham — Interaction and item design, version 0.1.10
- id: nasa-checklists
  resource: https://www.faa.gov/sites/faa.gov/files/2022-11/NASA%20Ames%20Rpt%20CR%20177549%20.pdf
  title: Degani and Wiener — Human Factors of Flight-Deck Checklists
generated:
  by: codex/gpt-6
  at: '2026-11-22T02:13:03Z'
---

# Verification checklist

Choose a verification checklist when there is finished work to inspect,
a known criterion, and time for a discrepancy to change the outcome. It
gives a reviewer a defensible answer about a defined version or state.
A comparison that nobody can act on has limited value.

## Fit and tradeoffs

A publishing team can use a rendered proof to confirm that an image has
the approved caption. The evidence is the caption actually on that proof
and the approved text. Two reviewers consulting only the editor’s note
that the caption was fixed would share a blind spot. A self-check can
detect an error. A claim of independent review needs evidence of who or
what was independent of the original action.

If a caption is missing from the proof, the reviewer can return that
specific proof for correction and check its replacement. If captions go
missing because editors lose their place while laying out several pages,
an [execution checklist](execution-checklist.md) could cue that action
earlier. Both designs can earn their place on the same job.

A caption match can supply evidence for a
[readiness decision](readiness-checklist.md) when someone must authorize
publication and other conditions, such as image rights, also matter.
An open question about the merit of a work may call for expert judgment
or a rubric. When all comparisons are mechanical, automation may handle
them directly. A checklist earns its cost where a person still has to
select the right evidence, interpret an exception, or coordinate correction and recheck.

## What supports the design

Degani and Wiener document how crews can check a configuration that has
already been set, including occasions when the expected response was
given without looking. That observation supports separating an observation
from recollection. It establishes neither the need for two people in every
setting nor the effectiveness of a particular checklist.[^nasa-checklists]

This pattern develops earlier guidance on interaction and item
design.[^checklist-design-origin] Missed discrepancies, false alarms,
and defects that escape the check provide better evidence about its
local value than the number of sign-offs.

[What a verification checklist establishes](../explainers/verification-checklist.md)
examines a package whose file count stays correct after damage.
[How to design a verification checklist](../guides/designing-a-verification-checklist.md)
shows how to design the comparison and deal with missing evidence. For
shared item wording and use protocols, see the
[checklist design guide](../guides/designing-a-checklist.md).

[^checklist-design-origin]: Craig Smitham, *Interaction and item design*, version 0.1.10.
[^nasa-checklists]: Asaf Degani and Earl Wiener, *Human Factors of Flight-Deck Checklists*, §5.2.2.
