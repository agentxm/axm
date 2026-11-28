---
type: Pattern
title: Readiness checklist
description: When proceeding depends on known conditions, gather current evidence against explicit criteria and give an accountable role a clear proceed, hold, or escalate decision.
tags: [docs, documentation-pattern, checklist, readiness-gate, readiness, release, coordination, decision, authoring]
status: draft
sources:
- id: checklist-design-origin
  resource: https://github.com/craigsmitham/agent-extensions/blob/156c3d4346bee6874ab3d356c19446cf6425713b/skills/checklist-design/src/references/purpose-and-artifact-fit.md
  title: Craig Smitham — Purpose and artifact fit, version 0.1.10
- id: aapm-checklists
  resource: https://aapm.onlinelibrary.wiley.com/doi/10.1002/acm2.13895
  title: Conroy et al. — Development, implementation, use and maintenance of safety checklists
generated:
  by: codex/gpt-6
  at: '2026-11-22T02:13:03Z'
---

# Readiness checklist

Choose a readiness checklist when work is about to cross a boundary,
the conditions for proceeding are known, and someone has authority to
hold or release it. The checklist brings observations from the relevant
people to that decision. A tally of completed preparation tasks can hide
the one condition that still prevents the handoff.

## Fit and tradeoffs

Suppose a workshop coordinator may open registration once the venue
confirms a room with enough places. An assistant can verify the capacity
against a seating plan. The coordinator still needs to know which room
the venue has confirmed for that date. If the room changes, the old
capacity check loses its bearing on the decision. A new confirmation and
capacity check give the coordinator grounds to reconsider a hold.

One coordinator could make that decision from a booking record. Where
several groups hold the evidence, they could exchange confirmations at
a handoff. A standing meeting adds little when one person already has
both the evidence and the authority.

The pause costs coordination time. It can prevent an error that would
be expensive to reverse, yet a standing approval meeting can keep people
waiting long after its original purpose disappears. If participants cannot
voice an unmet condition, a nominal power to stop yields little evidence
of readiness. Compare false releases and unnecessary holds with the actual
decision practice, including what happened after people proceeded.

If the criteria themselves are unsettled, an investigation or
[playbook](playbook.md) can help the team discover what matters. A
[verification checklist](verification-checklist.md) can establish a
condition, and a [runbook](runbook.md) can guide work after release.

## Evidence and application

In their safety checklist guidance for medical physicists, Conroy and
colleagues describe a pause in which the group responsible for each task
confirms its completion and accuracy. It illustrates a way to
coordinate observations. The broader pattern of an accountable release
decision is a synthesis informed by that example and by earlier checklist
design guidance.[^aapm-checklists][^checklist-design-origin]

[How a readiness checklist supports a decision](../explainers/readiness-checklist.md)
shows what happens when previously accurate evidence goes stale.
[How to design a readiness checklist](../guides/designing-a-readiness-checklist.md)
develops the decision, hold, and reopening conditions. The
[shared checklist guide](../guides/designing-a-checklist.md) covers
item wording and use protocols.

[^checklist-design-origin]: Craig Smitham, *Purpose and artifact fit*, version 0.1.10.
[^aapm-checklists]: Conroy et al., *Development, implementation, use and maintenance of safety checklists*.
