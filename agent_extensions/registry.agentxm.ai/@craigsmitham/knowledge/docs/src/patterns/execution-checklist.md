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
  at: '2026-11-11T17:40:43Z'
---

# Execution checklist

When competent users can miss known actions during a bounded task, **prompt
each action at its point of use and preserve dependencies, completion state,
and interruption recovery**.

## Problem and design response

The task and actions are established, but memory, distraction, or handoffs can
leave work undone. A concise prompt immediately before an action provides a
place to begin, maintain position, and recognize what remains. This commonly
uses read-do interaction. A team may add a caller and explicit responses.

NASA's flight-deck study describes a do-list that directs configuration step
by step and distinguishes it from checking an already configured system.
That distinction informs this pattern; it does not establish that cockpit
procedures transfer unchanged to another practice.[^nasa-checklists]

## How to write it

- Name the applicable task, entry condition, required competence, and finish.
- Put an actionable prompt where the action belongs in the workflow. Preserve
  actual dependencies; make independent items recognizable when order can vary.
- Define what counts as completing an item and who acts when roles differ.
- Group around natural pauses and handoffs. Show the current or incomplete
  item and how to re-establish state after interruption.
- Give a bounded response for an impossible or failed action. Link to the
  procedure that owns detailed recovery and exceptional branches.
- Keep explanations and exact procedural detail available where needed
  without reproducing a complete manual inside every prompt.

Use the shared [Checklist](checklist.md) guidance for evidence, accessibility,
validation, and maintenance. Prompting an action is not independent verification
that it happened correctly. Add a separately identified
[verification check](verification-checklist.md) when that is needed.

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

For a document release, prompts might direct the publisher to generate the
final artifact, open the rendered result, and upload the reviewed file. For a
workshop, prompts might direct the facilitator to distribute materials and
record unresolved questions at designated pauses. The invariant is prompting
known actions at useful moments; the order and completion evidence are local.

A sprawling troubleshooting list that requires choosing among unknown causes
does not fit this design. These examples illustrate fit and variation; they
are not evidence of improved outcomes.

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
