---
type: Guide
title: Synchronizing change artifacts with work-item hosts
description: Use for a user-requested manual checkpoint or repair when one exact Pitch, Change Specification, Change Design, or implementation plan must be created or updated in its canonical work-item host without re-authoring it.
tags: [change, pitch, change-specification, change-design, implementation-plan, synchronization, work-items, tracker, fidelity, readback, concurrency, compaction]
status: draft
sources:
  - id: stage-contract
    resource: ../processes/running-change-realization-stages.md
    title: Running a change-realization stage
  - id: changes
    resource: changes.md
    title: Changes
  - id: evidence-and-authority
    resource: preserving-work-item-evidence-and-authority.md
    title: Preserving evidence and authority in software work items
generated:
  by: codex/gpt-5.6
  at: 2026-08-28T20:00:00Z
---

# Synchronizing change artifacts with work-item hosts

> **Authority:** This Guide defines a representation operation, not a
> change-realization stage, artifact class, lifecycle state, semantic
> authority, or host workflow.

Use this Guide only for an explicit manual checkpoint or repair of one exact
Pitch, Change Specification, Change Design, or plan. Initial Draft persistence
and lifecycle-state writes belong to the active focused stage under [Running a
change-realization stage](../processes/running-change-realization-stages.md);
they do not automatically invoke Sync Change.

## Goal and boundary

Persist one exact current artifact so another participant can recover it
without reconstructing conversation. Synchronization owns exact-source binding,
canonical-target selection, native mapping, scoped mutation, concurrency,
readback, and fidelity reporting.

It does not shape, specify, design, plan, accept, ratify, prioritize, assign,
estimate, implement, review, close, release, or create derived implementation
records. A plan can be synchronized as one canonical artifact. Expanding its
steps into host-native tasks is a separate coordination capability and is not
part of Gen Stack Sync Change.

## 1. Bind the exact source

Resolve the complete artifact, exact revision or content identity, canonical
target, current `Draft`, `Ready`, or `Accepted` state, Open items, decisions,
unknowns, and upstream bindings.

Do not reconstruct content from a title, summary, handoff, partial quotation,
or conversation summary. After context compaction, canonical readback is the
last recoverable exact source. If the user says later chat-only edits existed
but cannot supply them, stop before mutation and ask the user to recreate or
provide the exact artifact. Never infer the missing revision or promote its
state.

## 2. Keep one canonical target

- Store the complete artifact in a faithful native field set or body region.
- When another maintained document is canonical, store only its exact link and
  a current state synopsis in the work item.
- Never maintain two independently editable complete copies.
- Update the current artifact region in place. Do not create a superseded copy.

The host's revision history may preserve prior exact content for evidence. The
user-facing artifact remains the same current Pitch, Specification, Design, or
plan.

## 3. Map through the native host

Inspect the target identity, field schema, body format, relationship controls,
size limits, permissions, update behavior, and concurrency tokens. Map:

```text
artifact meaning → semantically matching native affordances → residual body
```

Keep each fact once. Do not import vendor fields, labels, hierarchy, workflow,
or API assumptions into portable Gen Stack meaning. A host wrapper may
normalize harmless formatting but may not change artifact structure or
meaning.

## 4. Bound and protect the mutation

Resolve authorized item identities, fields, relationships, and body region
before writing. On update, change only the exact artifact representation and
explicit binding. Do not silently change title, summary, workflow, assignment,
priority, estimate, milestone, labels, or relationships.

Read immediately before mutation. Preserve unrelated content. Stop if the same
artifact location changed concurrently or safe replacement is ambiguous. A
repeat of the same exact source is unchanged. Do not replay a write whose
outcome is unknown.

## 5. Write, read back, and compare

Make the smallest coherent authorized write, retrieve authoritative persisted
state, and compare it with the exact source. A successful request or echoed
payload is not readback.

Verify:

- artifact class, exact identity, canonical target, and upstream bindings;
- `Draft`, `Ready`, or `Accepted` state and matching Open items;
- every material source, decision, constraint, alternative, tradeoff,
  unknown, risk, blocker, and authority;
- required headings, tables, diagrams, code blocks, links, and Evaluation
  mappings; and
- absence of unauthorized field, relationship, or lifecycle changes.

Report:

- `VERIFIED-EXACT` — normalized source and persisted representation agree;
- `VERIFIED-FAITHFUL` — documented harmless host changes preserved every
  material structural and semantic obligation;
- `DRIFT` — material content, structure, state, authority, or scope
  differs; or
- `UNVERIFIED` — authoritative readback or comparison is unavailable.

Do not call a `DRIFT` or `UNVERIFIED` write successful. Correct drift only within
the original authority and read back again.

## Failure and fallback

When mutation capability is unavailable, return the exact host-neutral payload
and report `UNVERIFIED`; do not claim persistence. When the host cannot carry
the artifact faithfully, retain another canonical home and use a linked
synopsis.

Keep restricted evidence, credentials, personal information, private customer
content, and exploitable detail outside targets whose disclosure boundary does
not permit them.

## Done

- Exact source and target are attributable.
- One canonical target remains clear.
- The current artifact was updated in place.
- Mutation stayed inside scope and preserved concurrent work.
- Authoritative readback supports an honest fidelity result.
- Missing chat-only content, partial effects, conflicts, and recovery remain
  explicit.
