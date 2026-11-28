---
type: Guide
title: How to write a runbook
description: When an established procedure needs to work across shifts, write and rehearse the instructions another operator needs to complete it or hand it off.
tags:
- docs
- runbook
- authoring
- procedure
- rehearsal
status: draft
generated:
  by: codex/gpt-6
  at: '2026-11-22T01:59:18Z'
sources:
- id: aws
  resource: https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_ready_to_support_use_runbooks.html
  title: AWS Well-Architected — Use runbooks to perform procedures
---

# How to write a runbook

Start with a task the team can already perform. Obtain the maintained
procedure or observe an authorized operator on a rehearsal target.
Ask what request lets them start, which state changes, and what they would
show the next person as proof of completion.

## Pin the request to a target and an end state

Suppose a station asks for a runbook to publish its approved timetable.
For this worked example the display controller has a rehearsal screen,
revision history, and a **Publish** control. Ask the operator who approves
a revision and who may publish it.
Write the first line of the draft so it can stop a mistaken change.

> **Publish the approved timetable to the named display.** Start with a
> signed dispatch request naming both the display and the timetable revision.
> Use the publisher account. If either identifier differs from the request,
> stop and return the discrepancy to the duty lead.

## Write through the first consequential failure

Walk through one authorized change. Record the previous state before the
step that changes it. Put the observation that determines success beside
the action. Get retry and recovery conditions from the team. Here the
station permits one publish attempt and reserves rollback for the lead.
Those are facts of this example to replace with the local procedure.

> 1. Read the revision from the display itself and record it on the request.
>    In the controller, compare the selected revision ID and target display
>    ID with the two identifiers on the signed request.
> 2. If both match, select **Publish** once and record the attempt. When
>    the controller reports completion, read the revision on the named
>    display and compare its first departure with the approved timetable.
> 3. If the display shows the requested revision and departure, record
>    both on the request and hand it back to dispatch. If either check
>    fails or the controller reports failure, leave the controller state
>    intact. Give the duty lead the request with the target, previous
>    revision, requested revision, attempt, and observed result.

Ask the operator what happens if the controller never reports a result.
The runbook needs the locally agreed timeout and escalation contact at that
point. An invented time limit could send two operators to act on the same
pending change. Suppose the owner confirms that the
controller marks a stalled job **Timed out** and bars a second submission
until dispatch clears the first. Add the exact instruction to step 3.
*On **Timed out**, record the job ID and call the duty lead with that ID.
Leave the pending job for dispatch to clear.* Confirm the actual signal
and contact before adopting the procedure locally.

## Rehearse the handoff

Give a second operator the draft and a case they can safely rehearse.[^aws]
At the station, supply a signed sample request and a rehearsal display.
Have them run the normal case. Then supply a target that still
shows the old revision after the controller acknowledges the change.
Inspect both the display and the record delivered to dispatch. In the
second case, can the lead tell which revision was visible and whether
anyone tried to publish twice?

Revise where the operator supplied a step from memory. Record the
conditions the rehearsal covered, who maintains the runbook, and what
change to the work would call for another trial.

[^aws]: [AWS Well-Architected — Use runbooks to perform procedures](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_ready_to_support_use_runbooks.html).
