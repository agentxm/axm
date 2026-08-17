---
type: Explanation
title: Work item titles and summaries
description: Why a work item's title and summary form a derived brief that serves the reading surfaces where items are scanned rather than opened, and why restating that brief changes nothing else about the item.
tags: [work-item-title, work-item-summary, issue-title, backlog-legibility, triage, roll-up, tracker-fields, scannability]
status: draft
sources:
  - id: jira-issue-fields
    resource: https://confluence.atlassian.com/adminjiraserver/issue-fields-and-statuses-938847116.html
    title: Atlassian — Issue fields and statuses
  - id: azure-titles-descriptions
    resource: https://learn.microsoft.com/en-us/azure/devops/boards/queries/titles-ids-descriptions
    title: Microsoft Azure Boards — Query by title, ID, or rich-text fields
  - id: linear-write-issues
    resource: https://linear.app/method/write-issues-not-user-stories
    title: Linear Method — Write issues, not user stories
  - id: google-sre-incidents
    resource: https://sre.google/sre-book/managing-incidents/
    title: Google SRE — Managing Incidents
generated:
  by: claude/opus-5
  at: 2026-08-16T01:42:06Z
---

# Work item titles and summaries

A work item's **brief** is its title plus a one- or two-sentence summary. The
brief is the item's interface; the body and structured fields are its evidence.

Every work-item type has its own body — expected and actual behavior, affected
context and desired outcome, live state and timeline. None of that is visible
on the surfaces where most reads actually happen.

## The brief serves the surfaces that do not open the item

| Reading surface | What it shows | What the reader is deciding |
| --- | --- | --- |
| Backlog, board, or query result | Title only | Is this mine, is it next, have I seen it before |
| Search result, notification, or hover card | Title and a first fragment | Open it or move on |
| Parent, epic, or project roll-up | Titles and summaries of children | Does this collection still mean one thing |
| Status report or stakeholder update | Title and summary | What do I tell people outside the team |
| The opened item | The whole body | What do I actually do |

Only the last surface reads the carefully structured sections that the
authoring guides describe. Guidance that stops at the title leaves every other
surface to guess.

## The title distinguishes; the summary explains

Azure Boards defines a work item title as a short description that summarizes
the item and *helps team members distinguish it from others*.[^azure-titles-descriptions]
Linear makes the same point from the reader's side: a title should be easy to
scan, because most people read it on a list or board in the context of other
issues.[^linear-write-issues]

That is discrimination work — separating this item from its neighbors. A title
that also tried to carry what is broken today, who is affected, and why it
matters would stop doing the one job the list needs from it. The summary takes
that load in one or two sentences.

## Tracker vocabulary does not map onto the brief

| Host field | What it actually holds |
| --- | --- |
| Jira `Summary` | The title — "a brief one-line summary of the issue"[^jira-issue-fields] |
| Jira `Description` | The body — "a detailed description of the issue"[^jira-issue-fields] |
| Azure Boards `Title` and `Description` | The title, and the body |
| GitHub issue title and body | The title, and the body |
| Linear title and description | The title, and the body, where descriptions are optional[^linear-write-issues] |

Two portable consequences follow. Most trackers have no dedicated summary
field, so the summary normally lives as the first section of the body. And the
one common field actually named `Summary` is the title, so a field name is not
evidence of what belongs in it.

## The brief is derived, not authoritative

The body and structured fields are the source of truth. The brief restates
them. Two things follow from that direction of dependence.

Rewriting the brief is safe and expected. A title written at intake records
what was known at intake — usually the reporter's first symptom or the
requester's imagined mechanism. By the time the item is triaged, diagnosed, or
scoped, the item usually knows more than its title does.

Nothing may exist only in the brief. A decision, a scope boundary, an owner, or
an acceptance condition that appears in the summary and nowhere else has been
recorded in the wrong place, where no reviewer will look for it and any later
restatement will destroy it.

## Restating is not refining

| Restating the brief | Refining the item |
| --- | --- |
| Rewrites the title and summary | Changes scope, requirements, or acceptance criteria |
| Reflects what the item already contains | Adds decisions, priority, estimates, or assignment |
| Can run across a whole collection at once | Needs the people accountable for the work |

Holding these apart is what makes a backlog safe to make legible. A pass that
only restates cannot silently move anyone's commitments; a pass that mixes the
two cannot be trusted to have left them alone.

## Some briefs are stable and some are time-varying

A defect report or feature request settles once triaged: the discrepancy or the
need does not change while the item waits.

An operational incident record describes a situation in motion. Its impact,
severity, and response state change while the record is open, so its brief has
to be re-derived at every material change. This is the same pressure that leads
Google SRE to keep a living incident document with the most important current
information at the top.[^google-sre-incidents] An incident brief that describes
a moment that has passed is worse than a stale backlog title, because people
act on it.

## Failure modes

| Failure | What it looks like |
| --- | --- |
| Frozen intake title | Still names the first reported symptom or the requester's proposed mechanism after the item is known to be something else |
| Echo summary | Restates the title in longer words and adds no information |
| Outcome-only summary | Spends both sentences on what will change and never says what is wrong now or why it matters |
| Smuggled scope | Introduces a commitment, owner, or acceptance condition that appears nowhere else in the item |
| Prefix noise | Repeats a tracker identifier, item type, or team label that the surrounding surface already displays |
| Body dump | A "summary" that is the first paragraph of the description, procedural history included |

## Related

For the authoring procedure, read
[Titling and summarizing work items](titling-and-summarizing-work-items.md).
The type-specific titling steps live in
[Recording operational incidents](recording-operational-incidents.md),
[Reporting software defects](reporting-software-defects.md), and
[Writing feature requests](writing-feature-requests.md).

[^azure-titles-descriptions]: Microsoft Azure Boards, "Query by title, ID, or rich-text fields," common fields table.
[^google-sre-incidents]: Google SRE, "Managing Incidents."
[^jira-issue-fields]: Atlassian, "Issue fields and statuses."
[^linear-write-issues]: Linear Method, "Write issues, not user stories."
