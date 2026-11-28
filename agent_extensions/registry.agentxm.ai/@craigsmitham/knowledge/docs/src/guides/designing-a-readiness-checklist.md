---
type: Guide
title: How to design a readiness checklist
description: When a named person must decide whether work can proceed, turn the governing conditions into current evidence, a disposition, and a way to reopen a held decision.
tags: [docs, readiness-checklist, authoring, readiness, evidence, decision, hold]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T02:02:34Z }
sources:
  - id: orr
    resource: https://nodis3.gsfc.nasa.gov/displayAll.cfm?Internal_ID=N_PR_7123_001C_&page_name=all
    title: NASA NPR 7123.1C — Appendix G, Operational Readiness Review
---

# How to design a readiness checklist

Identify who can authorize the work and what must be true for them to do
so. Use the governing agreement and take any unclear criterion to its
owner. Suppose a box office asks for a checklist to decide when to open
ticket sales for a concert. The following conditions are illustrative
agreements for that desk.

## 1. Identify the point at which someone can still choose

Write the decision in the owner's terms. Here the box office lead can
open public sales or keep them closed. They need an inventory that
matches the venue’s current seating plan. Agree who can confirm the
plan, what evidence counts, and which changes invalidate a previous check.
Trace a supposed exception to whoever has the authority to allow it.

Separate the evidence needed to start a review from the evidence needed
to authorize the work.[^orr] Receipt of the seating-plan file lets a
technician start checking inventory. To open sales, the lead needs the
result of that comparison against the venue’s current plan.

## 2. Put the decision and its alternatives on the page

Put the prompts where the lead records the sales-opening decision. For
example, the concert’s booking record could include this checklist.

> **Open public sales for this concert?** The box office lead records the
> decision before releasing the inventory.
>
> - Obtain the venue’s confirmation of the room and seating-plan revision.
>   Record the revision and the confirming contact. If the venue has issued
>   a later plan, that revision governs the check.
> - Find the technician's inventory comparison for the confirmed room and
>   revision. Check that all sellable seats match. If the report is missing,
>   for a different revision, or shows a discrepancy, keep sales closed.
> - When both conditions hold, the lead can open sales and record which
>   evidence supported the decision. On hold, record the missing condition
>   and who will resolve it. Refer a disputed room allocation to the venue
>   manager and reconsider when the current evidence is available.

Use the [shared checklist design guide](designing-a-checklist.md) for item
wording, handoffs, and how to try the checklist at the point of work. Keep
inventory repair instructions in the procedure the technician uses after
a discrepancy. The decision owner needs to know when to reconvene.

## 3. Rehearse the decision with changed evidence

Give the lead a confirmed revision A and a matching report. Then replace
the venue confirmation with revision B while leaving every check mark
from the previous run in place. The lead should hold sales and ask for
a comparison against B. Now supply a report for B with an unmatched
seat. A report has arrived, but the hold still has a reason. Finally try
a matching report and ask who may authorize opening.

If the same marks permit every outcome, revise the comparison or the
authority statement. If nobody can resolve a disagreement under the
current rules, record the gap for the accountable owner. A missing rule
cannot be supplied by adding a box.

For the ticket desk, a useful trial log records which revision the lead
actually inspected, whether a stale report caused a hold, and whether a
discrepant seat reached public sales. For a reusable candidate, include the
[maintainer note](designing-a-checklist.md#decide-what-would-justify-keeping-it)
with the checklist and identify any open ownership or evidence questions.

[^orr]: NASA, [Systems Engineering Processes and Requirements](https://nodis3.gsfc.nasa.gov/displayAll.cfm?Internal_ID=N_PR_7123_001C_&page_name=all), retired edition NPR 7123.1C, appendix G.12, table G-12.
