---
type: Pattern
title: Checklist for recurring omissions
description: When familiar work has recurring omissions, a checklist gives people observable prompts where they act and a way to respond when an item is unmet.
tags: [docs, documentation-pattern, checklist, checklist-design, verification, coordination, human-factors, validation, authoring]
status: draft
sources:
- id: checklist-design-origin
  resource: https://github.com/craigsmitham/agent-extensions/tree/156c3d4346bee6874ab3d356c19446cf6425713b/skills/checklist-design/src
  title: Craig Smitham — Checklist design skill and references, version 0.1.10
- id: nasa-checklists
  resource: https://www.faa.gov/sites/faa.gov/files/2022-11/NASA%20Ames%20Rpt%20CR%20177549%20.pdf
  title: Degani and Wiener — Human Factors of Flight-Deck Checklists
- id: aapm-checklists
  resource: https://aapm.onlinelibrary.wiley.com/doi/10.1002/acm2.13895
  title: Conroy et al. — Development, implementation, use and maintenance of safety checklists
- id: mrc-process
  resource: https://www.bmj.com/content/350/bmj.h1258
  title: Moore et al. — Process evaluation of complex interventions
generated:
  by: codex/gpt-6
  at: '2026-11-22T02:13:03Z'
---

# Checklist for recurring omissions

Choose a checklist when people know the work, yet a consequential action,
observation, or exchange keeps getting missed. The useful part is a prompt
someone can act on while there is still time to put things right.

## Problem and applicability

Suppose support engineers pass an unresolved customer issue from one shift
to the next. Both shifts know how to investigate it, yet several issues
have gone unattended because each shift thought the other still owned them.
A prompt on the issue can ask who has accepted the next action. A spoken
readback at shift change could serve the same purpose if both people are
there. In either case, someone can see the missing acknowledgment while
the outgoing shift can still arrange cover.

Now suppose the next owner is already clear, but that engineer lacks
access to the affected service. Another prompt to acknowledge ownership
would add work. The change that matters is arranging access or handing
the issue to someone who has it.

Choose a different primary aid when another problem dominates:

| Reader's need | Alternative and possible checklist role |
| --- | --- |
| Complete procedural detail | [Runbook](runbook.md); checklist at entry, pause, or completion points |
| Diagnosis and response selection | [Playbook](playbook.md) or decision tree; branch-local checks |
| Judgment across quality dimensions | Rubric; checklist for evidence or coverage |
| Structured data capture | Form; prompts for omissions or follow-up |
| Deterministic prevention | Automation or an interface constraint; checks for exceptions |
| Substantial instruction and practice | [Tutorial](tutorial.md), worked examples, coaching, or simulation; temporary learning prompts |

An ordinary personal to-do list needs little of this machinery. A maintained
checklist is justified by a recurring omission or coordination problem, not by
the availability of checkbox formatting.

## Choose a design for the likely omission

The purpose of a prompt determines what its answer needs to show. Once
you know the purpose, choose how people will use the prompt. For example,
either a spoken exchange or a written check can support a release decision.
If the purpose is learning, the question becomes what the learner will
later be able to do without the cue.

| Purpose | Pattern |
| --- | --- |
| Carry out known actions without omission | [Execution checklist](execution-checklist.md) |
| Detect incorrect or missing completed work | [Verification checklist](verification-checklist.md) |
| Decide whether conditions permit proceeding | [Readiness checklist](readiness-checklist.md) |
| Make reporting coverage or inspection findings explicit | [Reporting and review checklist](reporting-review-checklist.md) |
| Support practice toward later independence | [Learning checklist](learning-checklist.md) |

For an account of how a prompt changes a handoff, read
[What a checklist changes at the point of work](../explainers/checklist.md).
For item design, interaction, adaptation, and validation, use
[How to design a checklist](../guides/designing-a-checklist.md).
Where purposes conflict, separate the checks so that the person using
each can recognize the decision and the evidence it requires.

## Tradeoffs and failure modes

Prompts can make omissions and handoffs visible, while adding attention and
maintenance costs. Excessive coverage creates irrelevant work; excessive
compression makes interpretation depend on memory. Independence of verification
costs time and coordination. Familiarity can encourage ritual responses.

In the shift example, a compulsory owner field might merely fill with the
outgoing engineer’s name. A verbal reply might come from someone unable to
accept the work. The form, language, timing, and authority to speak up
matter whenever they change what people can actually observe or do.

## Evidence and maintenance

Degani and Wiener observed how flight crews used normal checklists, including
the method of performing or confirming an action and reporting completion.[^nasa-checklists]
Process evaluation examines implementation and context, both of which matter
when interpreting an intervention’s results.[^mrc-process] The [checklist explainer](../explainers/checklist.md)
examines this distinction using evidence from a field trial. A change of
tools, roles, or criteria can make a prompt obsolete. Conroy and colleagues
include revision and retirement in their practice guidance.[^aapm-checklists]

The shift handoff illustrates a design adapted from earlier checklist
guidance.[^checklist-design-origin] A count of acknowledged issues would
show use. To find out whether ownership gaps fell, the team would have to
compare issues actually left unattended across comparable shifts.

[^checklist-design-origin]: Craig Smitham — Checklist design skill and references, version 0.1.10.
[^nasa-checklists]: Degani and Wiener — Human Factors of Flight-Deck Checklists.
[^aapm-checklists]: Conroy et al. — Development, implementation, use and maintenance of safety checklists.
[^mrc-process]: Moore et al. — Process evaluation of complex interventions.
