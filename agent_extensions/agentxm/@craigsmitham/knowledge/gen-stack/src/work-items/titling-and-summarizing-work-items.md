---
type: Guide
title: Titling and summarizing work items
description: Use when a work item must be recognizable in lists and search or its meaning has changed; write or re-derive its title and short summary without changing anything else.
tags: [issue-title, work-item-summary, summary-section, backlog-hygiene, triage, plain-language, batch-update, issue-template, defect-report, bugfix-specification]
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
  by: codex/gpt-5.6
  at: 2026-08-26T20:14:40Z
---

# Titling and summarizing work items

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when creating any work item, and again whenever what is known
about it materially changes. It applies to operational incident records, defect
reports, Change Specifications, Bugfix Specifications, and accepted delivery
work alike. For why the brief is a separate artifact from the body, read
[Work item titles and summaries](work-item-titles-and-summaries.md).

For a brief-only request, use this guide alone: do not load body, lifecycle, or
metadata guidance merely because those concerns exist on the item. When the
request also creates or changes body meaning, apply [Preserving evidence and
authority in software work items](preserving-work-item-evidence-and-authority.md).
When it mutates tracker fields, uses a batch, or encounters partial failures,
also apply [Managing work-item metadata and
labels](managing-work-item-metadata-and-labels.md).

## Goal

Someone scanning a list, a roll-up, or a search result can tell what the item
is and why it exists without opening it, and someone who does open it finds
nothing in the brief that the item does not support.

## Representation

Use the host's native title and summary or description affordances when they
exist. The title names the affected subject and observed condition, requested
outcome, or authorized change; the one- or two-sentence summary then states why
the item exists, current evidence or decision state, and the next material
action. Do not add a second title or summary block to the body, and do not use
a label or state field as a substitute for either. If the host has no summary
field, place the summary once at the start of the body.

## 1. Title what the item is about

The title's job is to separate this item from its neighbors on a list.[^linear-write-issues]
What it names depends on the type:

| Type | Title the | Example |
| --- | --- | --- |
| [Operational incident](recording-operational-incidents.md) | Affected service and observed impact | Checkout unavailable for some European customers |
| [Defect report](recording-defect-reports.md) | Affected behavior or artifact, observed result or finding, and triggering condition | Invoice export omits zero-value lines when tax details are included |
| [Change Specification](writing-change-specifications.md) | Bounded intended change outcome and discriminating context | Let account owners reconcile invoice history in external systems |
| [Bugfix Specification](writing-bugfix-specifications.md) | Authorized corrected behavior and discriminating condition | Preserve zero-value invoice lines when tax detail is exported |

Cut whatever the reading surface already displays: the tracker identifier, the
item type, and any team or component label that a structured field carries.
Record Defect-report and Bugfix relationships in structured links or the body,
not by putting report identifiers into Bugfix titles.

## 2. Say why the item exists before saying what should change

Write one or two sentences. Lead with the item's present reason for existing
and why that matters, then add only the outcome that its artifact type and
authority support. A Defect report summary preserves the observed discrepancy,
expectation, impact, and material uncertainty. A Bugfix Specification summary
names the identified Bug, authorized bounded correction, and why that response
matters. When both sentences merely restate the title, the summary has spent
its whole budget without explaining the item.

Defect report:

> **Weak:** Fix the invoice export so it includes zero-value lines.
>
> **Better:** Invoice exports silently drop zero-value lines whenever tax
> detail is included, so exported totals disagree with the invoice shown in the
> product. Finance has been reconciling against numbers that do not match.

Change Specification:

> **Weak:** Add an invoice export button.
>
> **Better:** Account owners who reconcile against an external ledger re-key
> invoice totals by hand every month, creating avoidable delay and error risk.
> Provide a bounded export path while preserving the current tax and access
> constraints; delivery remains proposed pending the recorded decision.

Bugfix Specification:

> **Weak:** Fix defect report #482.
>
> **Better:** The export filter treats zero-value lines as absent when tax
> detail is present, so exports disagree with displayed invoices. Preserve
> those lines in affected exports without changing tax calculation.

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
Re-deriving also does not change the artifact class: a Defect report title may
become more precise about the observed discrepancy, but it must not become a
corrected-behavior title. Create and link a separate Bugfix Specification when
corrective work is authorized.

For an incident, treat every material status or impact change as a trigger, and
keep the summary consistent with the live state block rather than describing a
moment that has passed.

## 6. Sweep a collection as one low-risk pass

Making a backlog, project, or epic legible is a distinct operation from
refinement. Apply the shared metadata guide for exact targeting, authorization,
partial failure, and readback. Keep each edit inside the title and summary.
When the two fields cannot be written in one operation, write the summary first
and the title last, so a newly sharpened title never points at a stale summary.

## Final check

- The title distinguishes the item from its neighbors on a list.
- The title names the observation-facing Defect report or the
  correction-facing Bugfix Specification without collapsing them.
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
