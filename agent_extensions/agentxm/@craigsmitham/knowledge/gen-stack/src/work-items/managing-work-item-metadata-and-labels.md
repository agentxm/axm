---
type: Guide
title: Managing work-item metadata and labels
description: Use when mapping semantic work-item state into tracker fields or labels, or when assigning, prioritizing, batching, and externally mutating items; keep host metadata a faithful projection of established meaning and verify persisted changes.
tags: [work-item, metadata, labels, fields, status, severity, priority, assignment, tracker, batch-update, readback]
status: draft
sources:
  - id: titles-and-summaries
    resource: work-item-titles-and-summaries.md
    title: Work item titles and summaries
  - id: defect-fields
    resource: failures-defects-and-defect-reports.md
    title: Failures, defects, and defect reports
  - id: change-fields
    resource: changes.md
    title: Changes
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T21:55:00Z
---

# Managing work-item metadata and labels

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). It supports action and adds
> neither semantic authority nor profile-conformance rules. The [Gen Stack
> application profile](/profile/gen-stack-application-profile.md) separately
> governs represented corpus concepts.

Use this guide when semantic work-item meaning must be represented in Linear,
GitHub, Jira, Azure Boards, an incident platform, or another host. It applies
to fields, issue types, labels, assignment, priority, workflow transitions,
bulk edits, and other external tracker mutations.

## Goal

Tracker metadata helps people filter, route, and coordinate work without
becoming a substitute for evidence, a hidden authority decision, or a second
inconsistent model of the work item.

## Representation

Inspect the host schema before choosing a field. Map a fact to a native field
only when its documented semantics, cardinality, lifecycle, and authority match
exactly; a similar label is insufficient. Store each fact once. When no exact
native affordance exists, use one compact, visibly fallback body block and
remove it if a later host mapping becomes authoritative. Labels remain derived
discovery or automation aids, not a second metadata system.

## 1. Establish meaning before choosing a field

Determine the semantic fact first, then inspect what the host can represent.
Do not infer semantic meaning from an existing field name. For example, Jira's
`Summary` is commonly the title, while other systems may expose a separate
brief or only a body.

Use this order:

1. identify the claim, decision, or relationship and its authority;
2. inspect the host field's actual meaning, allowed values, and update behavior;
3. choose the least lossy field or relationship control;
4. retain important distinctions in the body when one field cannot carry them;
5. document a local mapping only when repeated use warrants maintenance.

## 2. Keep independent metadata dimensions separate

| Dimension | Meaning |
| --- | --- |
| Type or class | The artifact or host workflow kind |
| Status | Position in the host workflow |
| Classification | What evidence says the case represents |
| Severity | Degree of observed or threatened impact under a local scale |
| Priority | Relative attention or scheduling decision |
| Assignment or ownership | Who currently has the named responsibility |
| Resolution | Selected disposition |
| Verification | Conditions, strategy, or evidence result |
| Relationship | How this item connects to another identity |

Do not make one label carry several of these decisions. In particular, severity
does not set priority, assignment does not prove authority, `done` does not
prove verification, and `bug` does not prove diagnosis.

## 3. Treat labels as projections, not semantic truth

Use labels for useful host-native filtering or automation when their meaning is
locally defined. Prefer orthogonal labels with one stable purpose. Avoid:

- composite labels that encode type, priority, team, and lifecycle together;
- labels that duplicate a reliable structured field;
- new labels created for a single item without a maintained retrieval need;
- labels that assert an unconfirmed diagnosis, accepted scope, or authority;
  and
- portable guidance that prescribes one vendor's taxonomy.

When a host's mandatory type or status is coarser than the semantic item, retain
the precise meaning in the body and relationships rather than inventing false
precision in labels.

## 4. Preserve decision authority

Set or change priority, assignment, target release, milestone, severity,
resolution, closure, or workflow state only when:

- the user explicitly authorized that mutation;
- the applicable local process requires it and identifies the authority; or
- you are faithfully recording an already established decision.

Creating or editing a work item's content does not automatically authorize any
of those changes. When a requested label would smuggle in a decision, explain
the gap and leave it unset.

## 5. Avoid redundant body and field copies

Let the host own stable mechanics it records reliably—identifiers, creation
times, assignees, workflow state, and native relationships—unless the body needs
a decision-time snapshot or the host cannot preserve the meaning. Keep the
body's source inventory, rationale, authority, evidence limits, and distinctions
that fields cannot express.

When both are material, name which is canonical and reconcile the projection.
Do not maintain two independently editable copies of the same fact.

## 6. Mutate external trackers safely

Before writing:

1. resolve the exact host, workspace, project, and item identities;
2. inspect current fields and allowed values;
3. preview the intended mapping and confirm it stays inside authorization;
4. make the smallest coherent mutation; and
5. retrieve the persisted item, fields, and relationships to verify the result.

A successful request or submitted payload is not persistence evidence. Report
unsupported fields, coercion, truncation, automation rewrites, and unavailable
readback as uncertainty rather than success.

## 7. Handle batches as independently verifiable items

For a collection update, define the selected set and invariant first. Keep each
mutation item-local unless the host provides a trustworthy atomic operation.
Continue past an item-local failure when doing so is safe, do not replay
non-idempotent mutations blindly, and retain:

- attempted, changed, unchanged, failed, and unverified item identities;
- the field mapping and authorization used;
- host errors or validation failures without sensitive content; and
- readback evidence for each claimed success.

Never summarize partial completion as a successful batch. A brief-only sweep,
for example, must not change labels, assignment, priority, relationships, or
workflow state.

## Final check

- Semantic meaning was established before choosing host fields or labels.
- Type, status, classification, severity, priority, assignment, resolution,
  verification, and relationships remain distinct.
- Labels support retrieval or automation without becoming semantic authority.
- No metadata mutation invented or exceeded a decision authority.
- Host fields and body content have one clear owner rather than divergent copies.
- Exact targets were resolved and persisted mutations were read back.
- Batch reporting preserves partial failure and unverified outcomes.
