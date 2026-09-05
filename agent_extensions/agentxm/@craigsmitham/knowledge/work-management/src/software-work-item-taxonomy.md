---
type: Reference
title: Software work-item taxonomy
description: Defines the portable work-item roles, classifications, neighboring activities, and distinctions that every guide and template in this bundle applies.
tags: [work-item, taxonomy, defect-report, bug-report, change, bugfix, incident-record, investigation, planning]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Software work-item taxonomy

This reference adapts the earlier work-item distinctions while owning the
portable meanings used throughout this bundle. A host
may use different issue types, fields, labels, and statuses, but those are
representations of these meanings rather than alternate definitions.

## Work item

A **Work item** is a durable case record that preserves enough identity,
context, evidence, decisions, relationships, lifecycle state, and next action
for one independently managed concern or bounded body of work to remain
recoverable over time.

The portable taxonomy has three roles:

| Role | Use when | Does not establish |
| --- | --- | --- |
| **Operational Incident Record** | Current or imminent operational impact requires coordinated response and a living record | Root cause, permanent correction, or closure |
| **Defect Report** | An observation, concern, or static finding may indicate a deficiency relative to an applicable expectation or intended use | That a defect is established, prioritized, or authorized for correction |
| **Change** | A proposed or authorized software modification has a recognizable outcome and boundary | Approval, priority, implementation, delivery, or verification |

## Defect and Bugfix

A **Defect** is a deficiency in a system or work product relative to an
applicable expectation or intended use. A **Defect Report** preserves evidence
that may indicate one or more Defects; the report is not itself proof.

The lowercase word *bug* is ordinary shorthand for a Defect. **Bugfix** is a
classification of a Change whose explicit purpose is to correct or acceptably
compensate for an established Defect. The corrective Change remains separate
from its provenance-bearing Defect Reports.

## Neighboring records and activities

- **Investigation** is uncertainty-reduction activity. A host may give it a
  record, but this bundle does not require another portable work-item role.
- **Tasks, stories, epics, milestones, and projects** are host-native planning
  constructs. They may relate to portable work items without redefining them.
- **Specifications, designs, decision records, tests, and runbooks** are peer
  artifacts. A Work item links or preserves relevant context without becoming
  their normative owner.
- **Delivery** is activity and state associated with a Change, not a separate
  portable role.

## Independent dimensions

Do not collapse these dimensions into one status:

| Dimension | Question |
| --- | --- |
| Evidence | What was observed, reported, measured, inferred, or unavailable? |
| Understanding | What is hypothesized, supported, confirmed, or disputed? |
| Decision | What was proposed, accepted, declined, deferred, or superseded, and by whom? |
| Delivery | What work is planned, active, implemented, rolled back, or abandoned? |
| Verification | Which conditions were assessed, for what revision and context, and what did the evidence establish? |
| Operational state | What impact, response, restoration, recovery, or monitoring state exists? |
| Closure | Which authority ended this item's active lifecycle, on what evidence, with which follow-up? |

A tracker status can project several of these dimensions for local convenience;
it cannot make an observation true, a decision authorized, or a result verified.

## Classification rule

Classify from the item's semantic job, not its current title, label, assignee,
or workflow state. When evidence does not support a role, preserve the source
as a host-native intake record until classification becomes possible.
