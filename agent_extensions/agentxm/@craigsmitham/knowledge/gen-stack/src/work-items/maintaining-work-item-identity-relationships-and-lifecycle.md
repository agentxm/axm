---
type: Guide
title: Maintaining work-item identity, relationships, and lifecycle
description: Use when creating, relating, merging, splitting, resolving, verifying, reopening, closing, or superseding software work items; preserve one case identity, explicit relationship meaning, independent state dimensions, and evidence-backed transitions.
tags: [work-item, identity, relationships, lifecycle, duplicate, merge, split, resolution, verification, closure, reopening, supersession]
status: draft
sources:
  - id: gen-stack-vocabulary
    resource: ../glossary.md
    title: Gen Stack vocabulary and relationship model
  - id: defect-lifecycle
    resource: failures-defects-and-defect-reports.md
    title: Failures, defects, and defect reports
  - id: incident-lifecycle
    resource: operational-incident-records.md
    title: Operational incident records
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:18:00Z
---

# Maintaining work-item identity, relationships, and lifecycle

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). It supports action and adds
> neither semantic authority nor profile-conformance rules. The [Gen Stack
> application profile](/profile/gen-stack-application-profile.md) separately
> governs represented corpus concepts.

Use this guide whenever work-item identity, relationships, or lifecycle state
may change. Pair it with the applicable type-specific guide from [Software work
items](index.md).

## Goal

Each work item continues to represent one recoverable case or body of work;
relationships explain how items interact without merging their authority; and
transitions state what actually changed, who decided it, and which evidence
supports it.

## Representation

Use native tracker identity, relationship, workflow, resolution, verification,
closure, and supersession fields only for the exact lifecycle dimensions they
own. Preserve each fact once and derive backlinks or rollups from that source.
When the host lacks an exact relationship or lifecycle affordance, use one
compact body fallback with stable linked identities and explicit semantics;
do not overload a similarly named status or label.

## 1. Choose whether to reuse or create an identity

Reuse an item when new evidence concerns the same independently managed case
and the item can retain every material occurrence. Create a separate item when
the new concern has an independently managed:

- occurrence, discrepancy, or bounded outcome;
- impact, command, or communication path;
- decision or delivery authority;
- rollback, verification, or closure condition; or
- artifact role, such as a Defect report and its Bugfix Specification.

When uncertain, preserve the new source for triage instead of asserting a
duplicate. Never retitle one artifact into a different artifact class merely
because understanding or delivery has advanced.

## 2. State relationship meaning explicitly

Use the host's relationship controls when they preserve the intended meaning;
otherwise record the relationship in the body. Useful local roles include:

- another occurrence of the same case;
- duplicate of a named canonical item;
- parent, child, or other host-native planning relationship;
- related incident, discrepancy, Bug, change, or regression;
- blocks, depends on, or is superseded by; and
- provides source, decision, implementation, or verification evidence for.

Do not invent one global relationship ontology or force every relationship into
parent-child form. State direction where it matters, maintain one authoritative
assertion, and treat backlinks or reciprocal fields as projections.

## 3. Merge, split, and supersede without losing history

For a duplicate or merge:

1. choose the canonical identity under the host's authority;
2. preserve each source occurrence and material evidence;
3. record the relationship, decision, authority, and rationale;
4. transfer only content whose provenance remains recoverable; and
5. leave a durable route from the non-canonical item to the canonical one.

For a split, create independently manageable identities, record why the split
occurred, allocate sources and scope without duplication or loss, and link the
resulting items. For supersession, identify the successor and state which
meaning or work the predecessor no longer governs. Superseded does not mean
deleted, disproved, or fully delivered.

## 4. Keep lifecycle dimensions independent

One host status rarely carries all semantic state. Preserve the dimensions
that matter for the item:

| Dimension | Question |
| --- | --- |
| Evidence or understanding | What do observations and investigation establish? |
| Decision or authority | What has been proposed, accepted, declined, or deferred, and by whom? |
| Delivery | What work is planned, active, implemented, rolled back, or superseded? |
| Verification | What conditions exist, what evidence was gathered, and what did it establish? |
| Operational state | What impact, service, response, restoration, or recovery state exists? |
| Follow-up | Which independently owned obligations remain? |

Map these to local fields and workflow without pretending the host's single
status defines them universally.

## 5. Distinguish resolution, verification, and closure

- **Resolution or disposition** records the selected response to the case.
- **Verification conditions** state what observable evidence must hold.
- **Verification strategy** states how the evidence will be gathered.
- **Verification result** records what a bounded execution established.
- **Closure** records an authorized end to this item's active lifecycle under
  local policy.

A merge, deployment, mitigation, or cleared alert is not verification by
itself. Closing one item does not close its incidents, source reports, child
work, recovery, review, or corrective change unless the governing process
explicitly owns those transitions.

## 6. Reopen or record a regression according to local policy

Preserve the new occurrence and its evidence first. Then follow the host's
rule to reopen the existing item or create a linked regression. Record the
reason, authority, relationship, and changed conditions. Do not erase the
earlier resolution or verification result; it remains evidence about the
earlier revision and conditions.

## 7. Make transitions attributable and recoverable

For every consequential transition, preserve:

- previous and new state or decision;
- time and actor or authority;
- evidence, criteria, or rationale;
- residual risk, open follow-up, and reactivation condition; and
- related items whose state did not automatically change.

After an external mutation, read back the item and relationships. For a batch,
continue past item-local failures when safe, preserve successful mutations, and
report every failed or unverified identity without claiming atomic success.

## Final check

- Each item represents one coherent, independently managed case or body of work.
- Work-item roles and source occurrences were not erased by retitling or merge.
- Relationship meaning, direction, and canonical assertion remain recoverable.
- Evidence, authority, delivery, verification, operational, and follow-up state
  remain distinct where material.
- Resolution, verification, and closure are not used as synonyms.
- Split, duplicate, regression, reopening, and supersession decisions preserve
  history and their deciding authority.
- Persisted transitions and relationships were read back or reported unverified.
