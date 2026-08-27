---
type: Guide
title: Preserving evidence and authority in software work items
description: Use when creating or substantively revising a software work item; preserve source occurrences, claim maturity, unavailable evidence, safe provenance, and decision authority without inventing or strengthening what the sources establish.
tags: [work-item, evidence, provenance, authority, uncertainty, source-inventory, claim-maturity, public-safety]
status: draft
sources:
  - id: gen-stack-vocabulary
    resource: ../glossary.md
    title: Gen Stack vocabulary and relationship model
  - id: preserving-context
    resource: preserving-technical-context.md
    title: Preserving technical context in software work items
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:18:00Z
---

# Preserving evidence and authority in software work items

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). It supports action and adds
> neither semantic authority nor profile-conformance rules. The [Gen Stack
> application profile](/profile/gen-stack-application-profile.md) separately
> governs represented corpus concepts.

Use this guide for every new work item and every substantive body revision.
Pair it with the applicable type-specific guide from [Software work
items](index.md). For supplied technical reasoning, also use [Preserving
technical context in software work items](preserving-technical-context.md).

## Goal

A later reader can recover what entered the system of work, what the available
evidence establishes, which claims remain uncertain, and who or what had
authority for each decision—without relying on memory or treating polished prose
as stronger evidence.

## Representation

Use native attachment, source-link, relationship, author, and timestamp fields
when their semantics and retention are sufficient. In the body, present each
otherwise homeless source occurrence once with source kind, stable identity or
safe retrieval key, observation context, availability, claim maturity,
authority, and evidence limits; then separate synthesis, decisions, and
unknowns. Do not copy complete external records or maintain a second editable
source inventory when the host already owns one.

## 1. Inventory source occurrences before synthesizing

For each material occurrence, request, observation, finding, or decision source,
preserve the smallest useful set of:

- source type or system;
- stable identifier and authoritative or controlled-access link;
- observation, report, request, or decision time, including timezone or known
  uncertainty;
- relevant environment, revision, conditions, and safe retrieval keys;
- direct statement, evidence, or faithful synopsis; and
- source or actor when the host does not preserve it reliably.

Keep independently meaningful occurrences traceable even when several inform
one work item. Do not replace several sources with one unattributed synthesis.
Do not duplicate identifiers or timestamps the host already preserves correctly.

## 2. Label claim maturity and evidence kind

Keep these distinctions visible in prose, tables, or structured fields:

| Claim kind | Useful states |
| --- | --- |
| Evidence | observed, measured, reported, unavailable |
| Understanding | inferred, hypothesized, supported, confirmed |
| Desired meaning | exploratory, candidate, recommended, proposed, accepted, rejected, superseded |
| Action | read-only, drafting, authorized mutation, awaiting approval |

Do not convert a report into an observation, a hypothesis into a finding, a
recommendation into a decision, or implementation activity into acceptance.
When understanding changes, append the new claim and its evidence instead of
rewriting history to make it appear known earlier.

## 3. Preserve authority with each decision

Record the decision, its time or revision, the applicable authority, and
material rationale. Keep separate decisions separate: classification,
severity, priority, assignment, scope, desired behavior, Architecture, Design,
delivery timing, resolution, verification, and closure may have different
owners.

Permission to edit the work item authorizes faithful recording, not invention.
When authority is missing or disputed, state the exact unresolved decision and
stop dependent action rather than choosing a plausible answer.

## 4. Preserve unknown, unavailable, and inapplicable honestly

- Use **unknown** when the value is not established.
- Use **unavailable** when material evidence should exist but cannot be
  recovered or accessed; name the missing source when safe.
- Omit an inapplicable field rather than filling the work item with
  `not applicable`.
- Do not infer a value from a label, status, assignee, implementation, or
  absence of contradictory evidence.

An incomplete but attributable record is safer than a complete-looking record
whose missing facts were manufactured.

## 5. Use safe evidence channels

Keep credentials, authorization material, personal information, private
customer content, confidential commercial information, restricted links, and
exploitable security detail out of public work items. Prefer:

- a safe synopsis that preserves the decision-relevant meaning;
- redacted excerpts or minimal examples;
- stable controlled-access evidence links; and
- safe correlation identifiers that do not expose restricted content.

Use specialized security, privacy, safety, legal, disaster-recovery, or
business-continuity channels when their governing process requires them. A
public work item may link a safe synopsis without becoming the evidence store.

## 6. Keep the body proportional but lossless

Include what the current reader and next authorized action need. Link stable
peer authorities instead of copying them into competing normative statements.
Omit empty template sections, speculative detail, and source material that has
no bearing on the case.

Compression must not erase a material source, constraint, decision state,
uncertainty, dissent, or evidence limitation. A short title or summary never
justifies trimming the authoritative body.

## 7. Verify the record against its sources

Before publishing or persisting:

1. compare every material body claim with its source;
2. confirm that attribution, maturity, uncertainty, and authority survived the
   synthesis;
3. verify that sensitive evidence is absent or correctly governed;
4. confirm that links and identifiers resolve when they are available; and
5. after an external write, read back the persisted item rather than treating
   a submitted payload as proof.

## Final check

- Every material source occurrence remains traceable or explicitly unavailable.
- Facts, reports, measurements, inferences, hypotheses, proposals, and accepted
  decisions remain distinguishable.
- Each consequential decision names its applicable authority.
- Unknown information was not invented or inferred from tracker state.
- Public content and evidence links follow the governing disclosure boundary.
- Stable authorities are linked rather than copied into competing statements.
- The persisted result, when externally written, was read back and checked.
