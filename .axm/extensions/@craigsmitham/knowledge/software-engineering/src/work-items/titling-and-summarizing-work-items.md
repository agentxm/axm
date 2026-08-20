---
type: Guide
title: Titling and summarizing work items
description: How to write and re-derive a work item's title and one- or two-sentence summary so it is understandable at a glance, traceable to the item, and safe to update without changing anything else.
tags: [issue-title, work-item-summary, summary-section, backlog-hygiene, triage, plain-language, batch-update, issue-template]
status: draft
sources:
  - id: brief-explainer
    resource: work-item-titles-and-summaries.md
    title: Work item titles and summaries
  - id: jira-issue-fields
    resource: https://confluence.atlassian.com/adminjiraserver/issue-fields-and-statuses-938847116.html
    title: Atlassian — Issue fields and statuses
  - id: linear-write-issues
    resource: https://linear.app/method/write-issues-not-user-stories
    title: Linear Method — Write issues, not user stories
generated:
  by: codex/gpt-5
  at: 2026-08-20T16:05:37Z
---

# Titling and summarizing work items

Use this guide when creating any work item, and again whenever what is known
about it materially changes. It applies to operational incident records, defect
reports, feature requests, and accepted delivery work alike. For why the brief
is a separate artifact from the body, read
[Work item titles and summaries](work-item-titles-and-summaries.md).

## Goal

Someone scanning a list, a roll-up, or a search result can tell what the item
is and why it exists without opening it, and someone who does open it finds
nothing in the brief that the item does not support.

## 1. Title what the item is about

The title's job is to separate this item from its neighbors on a list.[^linear-write-issues]
What it names depends on the type:

| Type | Title the | Example |
| --- | --- | --- |
| [Operational incident](recording-operational-incidents.md) | Affected service and observed impact | Checkout unavailable for some European customers |
| [Defect](reporting-software-defects.md) | Affected behavior, observed result, and triggering condition | Invoice export omits zero-value lines when tax details are included |
| [Feature request](writing-feature-requests.md) | Desired ability or outcome | Let account owners export invoice history for external reconciliation |

Cut whatever the reading surface already displays: the tracker identifier, the
item type, and any team or component label that a structured field carries.

## 2. Say why the item exists before saying what should change

Write one or two sentences. Lead with what is wrong, missing, or at risk now
and why that matters; then state the intended change or outcome. When both
sentences describe the desired outcome, the summary has spent its whole budget
restating the title.

Defect:

> **Weak:** Fix the invoice export so it includes zero-value lines.
>
> **Better:** Invoice exports silently drop zero-value lines whenever tax
> detail is included, so exported totals disagree with the invoice shown in the
> product. Finance has been reconciling against numbers that do not match.

Feature request:

> **Weak:** Add invoice history export so account owners can export invoices.
>
> **Better:** Account owners who reconcile against an external ledger re-key
> invoice totals by hand every month, which is slow and error-prone. They need
> to pull invoice history out of the product directly.

Operational incident, written for the current moment:

> Checkout has been failing for customers in the EU region since 09:12 UTC,
> blocking new orders there. A suspected connection-pool exhaustion is being
> mitigated by a rollback and impact is ongoing.

Stop at two sentences. Prefer familiar words and direct sentences, and leave
out procedural history, repetition, and implementation detail. This limit
applies only to the derived brief; never shorten the body or discard linked
technical context to meet it.

## 3. Keep every claim traceable to the item

Do not introduce rationale, scope, requirements, decisions, commitments,
ownership, priority, or expected outcomes that the item does not already
contain. Preserve meaningful uncertainty, and keep a reported need
distinguishable from a proposed solution.

If restating the item reveals that it says too little to summarize, that is a
triage finding. Record the gap or ask the reporter; do not close it by
inventing a plausible reason.

## 4. Put the summary where readers reach it first

1. A dedicated summary or brief field, when the tracker genuinely has one.
2. Otherwise, replace the contents of an existing `## Summary` section.
3. Otherwise, add `## Summary` as the first section of the body and leave the
   rest of the body unchanged.

Confirm what a field holds before writing to it. Jira's `Summary` is the title
— "a brief one-line summary of the issue" — and its body lives in
`Description`.[^jira-issue-fields]

## 5. Re-derive the brief when understanding changes

Re-derive when triage reclassifies or merges the item, a cause is confirmed, a
scope decision narrows or widens the work, an incident's impact or status
changes, or the item joins a roll-up where its title reads wrong beside its
siblings.

Re-deriving changes the title and summary and nothing else. Leave status,
priority, assignment, project or parent, labels, relations, requirements,
acceptance criteria, and disposition to the separate decisions that own them.

For an incident, treat every material status or impact change as a trigger, and
keep the summary consistent with the live state block rather than describing a
moment that has passed.

## 6. Sweep a collection as one low-risk pass

Making a backlog, project, or epic legible is a distinct operation from
refinement. Process the whole selected collection, keep each edit inside the
title and summary, continue past an item-local failure, and report which items
could not be updated. When the two fields cannot be written in one operation,
write the summary first and the title last, so a newly sharpened title never
points at a stale summary.

## Final check

- The title distinguishes the item from its neighbors on a list.
- The summary adds meaning beyond the title.
- A reader can tell why the item exists wherever the item provides that
  evidence.
- The current problem stays distinguishable from the desired outcome.
- Every claim in the brief is supported by the item.
- No decision, commitment, or boundary exists only in the brief.
- No body context was removed to satisfy the brief's length limit.
- Nothing outside the title and summary changed.

[^jira-issue-fields]: Atlassian, "Issue fields and statuses."
[^linear-write-issues]: Linear Method, "Write issues, not user stories."
