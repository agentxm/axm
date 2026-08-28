---
type: Guide
title: Synchronizing change artifacts with work-item hosts
description: Use when an exact Pitch, Change coordination record, Change Specification, Change Design, or implementation plan must be created or updated in a work-item host without re-authoring it, or when an exact plan must be deliberately projected into host-native implementation records.
tags: [change, pitch, change-specification, change-design, implementation-plan, synchronization, work-items, tracker, projection, fidelity, readback, concurrency]
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
  at: 2026-08-27T23:32:00Z
---

# Synchronizing change artifacts with work-item hosts

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](../glossary.md). It defines a
> representation operation, not another change-realization stage, artifact
> class, maturity state, semantic authority, or host workflow.

Use this Guide after Shape, Spec, Design, Quick Change, or Plan has produced an
exact artifact that must survive in a work-item host. The host may be any
tracker, issue system, planning system, document-capable collaboration system,
or repository-native case store whose native contract can represent the
artifact faithfully. Inspect that contract at runtime; do not prescribe one
vendor's fields, labels, hierarchy, formatting, or workflow as portable Gen
Stack meaning.

## Goal

Persist one exact current artifact, or a deliberate projection of one exact
plan, so another authorized participant can recover the landed meaning without
reconstructing it from conversation, a brief, or independently rewritten work
items.

## Boundary

Synchronization owns exact-source binding, canonical-home selection, native
host mapping, authorized mutation, concurrency handling, persisted readback,
and fidelity reporting. It does not shape, specify, design, plan, accept,
ratify, prioritize, assign, estimate, implement, review, close, or release the
change.

Use one of two modes:

- **Artifact synchronization** creates or updates the canonical or linked host
  representation of one exact Pitch, Change coordination record, Change
  Specification, Change Design, or implementation plan.
- **Plan projection** creates or updates explicitly authorized host-native
  implementation records derived from one exact plan revision. It does not
  revise the plan or make its increments independently authoritative.

A request to update an artifact does not authorize plan projection. A request
to create implementation records does not authorize priority, assignment,
estimate, target date, workflow, label, or release changes.

## 1. Bind an exact source

Resolve the complete source content, artifact class, exact revision or content
identity when one exists, native maturity state, decisions incorporated,
unknowns, blockers, and current canonical home. Preserve the artifact's own
contract:

- a Pitch retains its disposition;
- a Change Specification retains its ratification state;
- a Change Design retains its acceptance state and Specification
  reconciliation;
- a plan retains its maturity and implementation authority; and
- a Change coordination record retains exact artifact bindings, coherence,
  delivery evidence, and next action.

Do not reconstruct an artifact from a title, summary, earlier handoff, partial
quotation, or conversation summary. When the exact source is unavailable,
stop before mutation and request or recover that source. A polished
reconstruction is not faithful synchronization.

When a delayed handoff may have made the source stale, inspect its canonical
home or supersession state without reopening the complete upstream authoring
workflow. Route a semantic revision to the artifact's owning stage.

## 2. Choose one canonical home

Record one canonical home for the current artifact:

- If the work-item body or an exact native field set is canonical, store the
  complete artifact there.
- If another maintained document or repository artifact is canonical, store a
  compact maturity synopsis and exact link in the work item.
- If the artifact is still conversational and persistence is authorized,
  choose the least durable adequate host location during this operation.

Do not maintain two independently editable complete copies. A Change
coordination record links the current exact revisions; it does not need a body
ledger of every prior revision when the canonical host already preserves
history. A persisted Pitch remains a Pitch, and its container does not become
a Change or acceptance record automatically.

## 3. Map through the native host contract

Inspect the exact target host, workspace, project or collection, item identity,
field schema, relationship controls, body format, update behavior, size limits,
and available version or concurrency controls.

Use this order:

```text
Gen Stack artifact meaning → native host affordances → exact fields and links
                           → residual canonical artifact body
```

Map a fact to a native field only when semantics, cardinality, lifecycle, and
authority match. Keep each fact once. The artifact's canonical Markdown
fallback governs residual body content when no richer native representation is
faithful.

When one body contains a summary, Change coordination, and one or more complete
artifacts, treat it as a host envelope:

1. one derived summary, only when the host lacks an exact summary affordance;
2. the Change coordination representation when applicable; and
3. each complete canonical artifact in its own contract and order.

The envelope does not merge artifact responsibilities. Host-added wrappers,
separators, or harmless formatting normalization may surround an artifact but
must not change its required headings, order, or meaning.

## 4. Bound the mutation

Resolve the authorized fields, body region, relationships, and item identities
before writing. Creation ordinarily includes the minimum host identity, title,
body or link, and exact source relationship needed for a usable record. An
update changes only the named artifact representation and any explicitly
authorized revision binding.

Title and summary are derived projections. Create them when the operation
creates a record. On update, re-derive them only when the request or applicable
host process authorizes that scope. If the synchronized artifact would make an
untouched brief materially false or misleading, report that discrepancy
instead of silently expanding the mutation.

Do not use comments as the canonical current artifact merely because they are
easy to append. Do not create labels, workflow states, assignments, estimates,
priorities, milestones, parents, or child items unless the exact operation
authorizes them.

## 5. Protect concurrent work and idempotency

Read the target immediately before mutation. Compare any available host
revision or update token with the state used to prepare the write.

- Preserve unrelated host-owned and human-authored content.
- Apply an item-local merge when the artifact location is unchanged and the
  host contract makes that merge unambiguous.
- Stop before overwriting when the same artifact location changed, its owner is
  unclear, or the host cannot distinguish safe replacement from destructive
  loss.
- Treat a repeated synchronization of the same exact source as unchanged.
- Never replay a mutation whose outcome is unknown unless the host and
  operation establish that replay is safe.

## 6. Write, read back, and compare

Make the smallest coherent authorized mutation, then retrieve the persisted
fields, body, relationships, and host revision. A successful request or echoed
payload is not readback.

Compare the persisted artifact with the exact source after applying only
documented, semantics-preserving host normalization. Verify:

- artifact class, exact source identity, and canonical-home relationship;
- required headings and order;
- every material source, decision, constraint, alternative, tradeoff,
  unknown, dissent, risk, blocker, and authority state;
- tables, diagrams, code blocks, links, and Evaluation mappings when present;
- artifact-specific maturity and reconciliation state; and
- absence of unauthorized field, relationship, or lifecycle changes.

Report one fidelity result:

- `verified-exact` — normalized source and persisted representation agree;
- `verified-faithful` — only documented harmless host representation changes
  occurred and every material structural and semantic obligation survived;
- `drift-detected` — material content, structure, authority, or scope differs;
  or
- `unverified` — authoritative readback or comparison evidence is unavailable.

Do not call a partial, drifted, or unverified write successful. Correct a drift
only within the original authorization, then read back again.

## 7. Project an exact plan deliberately

Enter this branch only when the user or an applicable process explicitly asks
to create or update host-native implementation records from one exact plan.
The plan remains canonical; its derived records coordinate execution.

Give every derived record a stable source-step identity and preserve:

- exact Change, Change Specification, Change Design, and plan revisions;
- intended outcome and bounded scope;
- affected Implementation Units and material dependencies;
- applicable constraints, invariants, and compatibility windows;
- required Evaluation feedback and final evidence;
- focused-review, continuation, and upstream-return conditions;
- verification, observability, and recovery; and
- delegated local decisions, blocking upstream decisions, and unknowns.

Link shared authoritative context instead of independently rewriting it in
every record. Before writing, validate the projection as a collection:

- every selected plan step appears exactly once;
- no derived record adds scope or strengthens authority;
- dependency identities and direction resolve;
- common revision bindings and invariants agree;
- independently actionable records have distinct verification and recovery;
  and
- no blocking upstream decision is represented as authorized implementation.

After writing, read back and verify each item independently. Report attempted,
created, updated, unchanged, failed, drifted, and unverified identities. Never
describe a partial batch as atomic success.

## Failure and fallback

When no authorized host mutation capability is available, produce the exact
host-neutral payload or mapping that can be transferred later and report the
operation as `unverified`; do not claim persistence. When a host cannot carry
the complete artifact faithfully, retain or establish another canonical home
and use the host only for a linked synopsis.

Keep restricted evidence, credentials, personal information, private customer
content, and exploitable details out of a target whose disclosure boundary does
not permit them. Faithfulness preserves all publishable material meaning; it
does not override evidence-governance or disclosure rules.

## Done

- The exact source and target are attributable.
- One canonical home is clear and no competing complete copy was introduced.
- Mutation stayed inside its authorized scope.
- Persisted state was read back and received an honest fidelity result.
- Partial effects, conflicts, unavailable capabilities, and next recovery are
  explicit.
- Plan projections, when authorized, remain complete, consistent, and derived
  from one exact plan revision.
