---
type: Explainer
title: What a runbook lets an operator repeat
description: Why a bounded procedure can accommodate branches, handoffs, and recovery while giving different operators
  the same recognizable finish.
tags:
- docs
- runbook
- operations
- procedure
- recovery
status: draft
generated:
  by: codex/gpt-6
  at: '2026-11-21T22:45:38Z'
sources:
- id: aws
  resource: https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_ready_to_support_use_runbooks.html
  title: AWS Well-Architected — Use runbooks to perform procedures
- id: branch
  resource: https://docs.aws.amazon.com/systems-manager/latest/userguide/automation-action-branch.html
  title: AWS Systems Manager — Conditional automation steps
---

# What a runbook lets an operator repeat

A runbook helps the next person on shift recognize when a job is
finished. Imagine a station dispatcher publishing an approved timetable
to the passenger display. Yesterday's dispatcher knew
which screen to check after publishing. Today's dispatcher has the same
access, but sees two green indicators. One means the upload finished.
The other means the display has fetched the new revision. Passengers can
still be looking at the old timetable when the first light comes on.

A runbook carries that distinction across shifts. Its unit is an operation
with a recognizable finish. For the dispatcher the operation starts with
a particular approved revision and display. It ends with evidence about
what passengers can see there. AWS uses this form for routine work as well
as incident response, and includes tools, permission, errors, and escalation
in its account of a usable procedure.[^aws]

## Why a second path can belong to the same procedure

Suppose one display reports its revision remotely and an older model
shows it only in a corner of the screen. The operator can still answer
the same question in either case. A condition the operator can observe
selects the check. Even an executable runbook can have this shape.
AWS Systems Manager can select a step from the result of an earlier
step and supply a default path if no choice matches.[^branch]

The distinction matters when neither display can confirm the revision.
An operator can report the failed check, identify the last confirmed
state and hand control to the duty lead. Repeating the upload on the
strength of a green light could obscure what happened. Deciding how to
keep passengers informed during a station-wide display failure opens a
larger question. The [playbook](../patterns/playbook.md) helps a lead
assess the situation and select a response. A runbook completion report
gives that decision evidence, including evidence that the task stopped.

To turn an established procedure into directions someone else can execute,
see [How to write a runbook](../guides/writing-a-runbook.md).

[^aws]: [AWS Well-Architected — Use runbooks to perform procedures](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_ready_to_support_use_runbooks.html).
[^branch]: [AWS Systems Manager — Conditional automation steps](https://docs.aws.amazon.com/systems-manager/latest/userguide/automation-action-branch.html).
