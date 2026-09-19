---
type: Guide
title: Preserving evidence and provenance
description: Use when creating or substantively revising a work item so sources, uncertainty, attribution, and decision authority survive synthesis.
tags: [work-item, evidence, provenance, attribution, uncertainty, authority, source-inventory, pe-delivery]
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Preserving evidence and provenance

Apply this guide to every new work item and every substantive body revision.
Synthesis is where sources, uncertainty, attribution, and decision authority are
most easily lost.

## Which sense of evidence this is

Several sections of this bundle use the word evidence, and they do not mean the
same thing. This guide means one of them: **record evidence**, the material a
work item preserves about what was observed, reported, measured, inferred, or
found unavailable, together with the provenance that keeps it attributable.

| Sense | What it is | Where it is owned |
| --- | --- | --- |
| Record evidence | What a work item preserves about an occurrence, and the provenance that makes it attributable | This guide, for every work-item role |
| Outcome evidence | What would tell a team that an intended outcome actually occurred | [What to solve](../../../problem/outcomes-and-evidence.md) |
| Assessment evidence | What establishes that a stated condition holds, in verification and validation | [What to build](../../../solution/requirements/foundations/verification-and-validation.md) |
| Review evidence | What a repository and its surroundings can supply to a bounded codebase verdict | [How to build it](../../../engineering/codebase-review/reviewing-a-codebase.md) |

Record evidence is not a verdict. Preserving it establishes nothing about
whether a condition holds, whether an outcome occurred, or whether a codebase is
sound. Those judgments are made elsewhere, and when one is made it becomes
material this guide preserves rather than material it produces. Diagnostic
evidence gathered during an incident is record evidence once it is captured into
an [Operational Incident Record](../incidents/); deciding what it means is
response work, owned by [How to run it](../../../operations/).

## 1. Inventory before synthesis

For each material occurrence, request, observation, finding, or decision,
preserve the smallest useful set of source system or kind, stable identity or
safe retrieval key, relevant time, environment or revision, conditions,
availability, and faithful statement or synopsis. Keep independently meaningful
occurrences traceable even when several inform one item.

## 2. Preserve claim kind and maturity

Do not convert:

- a report into a direct observation;
- an inference or hypothesis into a confirmed finding;
- a recommendation or proposal into an accepted decision; or
- implementation activity into approval, verification, or closure.

When understanding changes, retain the earlier attributable state or history
rather than rewriting the item to make new knowledge appear contemporaneous.

## 3. Preserve decisions with their authority

Record each consequential decision, its time or revision, applicable authority,
and material rationale. Classification, severity, priority, assignment, scope,
desired behavior, technical approach, delivery, verification, and closure may
have different authorities.

Permission to edit a work item authorizes faithful recording, not invention.
When a missing decision controls dependent action, state the exact unresolved
choice and stop that action.

## 4. Use safe evidence channels

Keep credentials, personal information, private customer content, confidential
commercial information, restricted links, and exploitable security detail out
of public records. Prefer safe synopses, minimal redacted examples,
controlled-access evidence links, and non-sensitive correlation identifiers.

## 5. Verify the synthesis

Compare material claims with their sources, confirm that attribution and
uncertainty survived compression, and check that stable links resolve when
available. After an external write, read back the persisted item; a submitted
payload is not persistence evidence.
