---
type: Pattern
title: Execution checklist
description: When competent users can miss known actions during a bounded task, prompt each action at its point of use and preserve dependencies, completion state, and interruption recovery.
tags: [docs, documentation-pattern, checklist, execution, read-do, omission, interruption, authoring]
status: draft
sources:
- id: checklist-design-origin
  resource: https://github.com/craigsmitham/agent-extensions/blob/156c3d4346bee6874ab3d356c19446cf6425713b/skills/checklist-design/src/references/purpose-and-artifact-fit.md
  title: Craig Smitham — Purpose and artifact fit, version 0.1.10
- id: nasa-checklists
  resource: https://www.faa.gov/sites/faa.gov/files/2022-11/NASA%20Ames%20Rpt%20CR%20177549%20.pdf
  title: Degani and Wiener — Human Factors of Flight-Deck Checklists
generated:
  by: codex/gpt-6
  at: '2026-11-22T02:13:03Z'
---

# Execution checklist

Choose an execution checklist when someone knows how to do a task but can
lose their place. It should let the person continuing the work see which
action is due for this particular item, even after a handoff.

## Problem and design response

The task and actions are established, but memory, distraction, or handoffs can
leave work undone. A concise prompt immediately before an action provides a
place to begin, maintain position, and recognize what remains. This commonly
uses read-do interaction. A team may add a caller and explicit responses.

Degani and Wiener describe crews using a do-list while configuring an
aircraft and a different method for checking a configuration afterward.
The distinction concerns what the crew does when an item is called.[^nasa-checklists]

[How an execution checklist helps work resume](../explainers/execution-checklist.md)
explores placekeeping under interruption. To develop an aid for a particular
sequence and rehearse the handoff, follow
[How to design an execution checklist](../guides/designing-an-execution-checklist.md).

## Applicability and tradeoffs

Use this pattern when users can perform the actions from concise prompts and
omission is a plausible failure. Use a [runbook](runbook.md) when the reader
needs a complete procedure, and a [playbook](playbook.md) when deciding what to
do remains the main problem. A novice who needs instruction may need a
[tutorial](tutorial.md) before this aid becomes useful.

Stepwise prompting adds interaction cost and can hinder familiar work if every
minor action demands acknowledgement. Too little detail forces reconstruction;
too much obscures the few consequential actions. Excessive read-do use can
substitute list following for recognizing a changed situation. Preserve a clear
stop or handoff when the task no longer matches.

## Illustrative realizations

Suppose a publisher prepares two editions of a handbook. A shared list
marked “rendered” leaves a colleague returning from a call to guess which
edition still needs a proof. A release record for each edition can carry
the last completed step. A card kept with each job can do the same where
the work moves between desks. The costly omission is sending the edition
on before somebody has reviewed its proof.

Once the proof exists, the question may change. “Has the publisher opened
the proof?” can cue the next action. “Does this proof contain the approved
figures?” needs a comparison against the approved source. That is a use for
a [verification checklist](verification-checklist.md). These publishing
cases illustrate how the designs can work together.

## Review and evidence

Observe omissions, incorrect actions, completion time, and recovery after
interruption against current practice or a feasible alternative. Test handoffs
and incomplete items, not just an uninterrupted successful run. More recorded
completion with unchanged task errors would challenge an execution claim.

This draft adapts the earlier purpose-and-fit guidance.[^checklist-design-origin]
Local actions still require domain authority, and the new formulation has not
been independently evaluated.

[^checklist-design-origin]: Craig Smitham — Purpose and artifact fit, version 0.1.10.
[^nasa-checklists]: Degani and Wiener — Human Factors of Flight-Deck Checklists.
