---
name: sync-change
description: Synchronizes an exact landed Pitch, Change coordination record, Change Specification, Change Design, or implementation plan into a work-item host without re-authoring it, and deliberately projects an exact plan into host-native implementation records when explicitly requested. Use for persist, sync, copy, create, or update tracker or issue content from a landed Gen Stack artifact. Not for shaping, specifying, designing, planning, prioritizing, assigning, implementing, reviewing, or release publication.
---

# Sync Change

Preserve one exact change-realization artifact in a host-neutral work-item
system, or deliberately project one exact plan into implementation records,
without converting persistence into another authoring pass.

This skill belongs to the Gen Stack pack. Resolve knowledge through active AXM
scope; in this source workspace read, in order:

- `knowledge/gen-stack/src/processes/running-change-realization-stages.md`; and
- `knowledge/gen-stack/src/work-items/synchronizing-change-artifacts.md`.

Read the artifact's owning Guide only when its exact source contract is
ambiguous. Do not rerun Shape, Spec, Design, Quick Change, or Plan merely to
prepare a host payload.

## Boundary and host neutrality

The portable contract is independent of any tracker, issue system, planning
system, document-capable collaboration system, or repository-native case
store. Inspect the selected host's actual fields, relationships, body format,
limits, revisions, and mutation behavior at runtime. Do not assume vendor
field names, labels, hierarchy, workflow, rich-text behavior, or API semantics.

Synchronization owns exact-source binding, canonical-home selection, native
mapping, authorized mutation, concurrency handling, persisted readback, and
fidelity reporting. It does not change artifact meaning or maturity and does
not accept, ratify, prioritize, assign, estimate, implement, review, close, or
release anything.

Use exactly one mode:

- **artifact-sync** for one exact Pitch, Change coordination record, Change
  Specification, Change Design, or implementation plan; or
- **plan-projection** only when the user or an applicable process explicitly
  asks to create or update host-native implementation records from one exact
  plan revision.

## Synchronize

1. **Bind the exact source.** Resolve the complete artifact, class, exact
   revision or content identity when one exists, native maturity, decisions,
   unknowns, blockers, and current canonical home. A title, summary, handoff,
   partial quotation, or conversation summary is insufficient. If exact
   content cannot be recovered, stop before mutation and name the source needed.
2. **Bind target and authority.** Resolve the exact host, workspace or
   collection, item identities, intended canonical home, allowed fields and
   relationships, external mutation authority, retry boundary, and permitted
   disclosure. Do not infer adjacent metadata authority from a content update.
3. **Inspect native behavior.** Read the current target and exact host schema,
   field semantics, formatting and size behavior, relationship controls,
   version or concurrency support, and authoritative readback capability.
4. **Choose one home.** Store the complete artifact when the selected body or
   native field set is canonical. Otherwise store only a compact maturity
   synopsis and exact link to the canonical artifact. Never create two
   independently editable complete copies.
5. **Prepare the smallest mapping.** Use exact native fields first and the
   artifact's canonical fallback for residual body content. Preserve required
   headings, order, sources, decisions, constraints, alternatives, unknowns,
   blockers, authority, Evaluation mappings, maturity, and reconciliation.
   Keep host summary and coordination wrappers outside artifact contracts.
6. **Protect concurrent work.** Re-read the target immediately before writing.
   Preserve unrelated content. Apply only an unambiguous item-local merge. Stop
   before overwriting when the same artifact location changed or ownership is
   unclear. Treat an identical repeat as unchanged.
7. **Mutate once.** Make the smallest coherent authorized write. Do not update
   title, summary, labels, workflow, priority, assignment, estimate, milestone,
   hierarchy, relationships, or comments unless they are explicitly within the
   operation. Creation includes only the minimum usable identity and source
   relationship.
8. **Read back.** Retrieve persisted fields, body, relationships, and host
   revision. Never verify against the submitted payload or success response.
9. **Compare and report.** Apply only documented semantics-preserving host
   normalization, then report `verified-exact`, `verified-faithful`,
   `drift-detected`, or `unverified`. Correct detected drift only inside the
   original authorization and read back again.

Do not add a review gate when the user already authorized the exact safe
mutation and target state is unambiguous. Stop for a real decision only when
the source, canonical home, target, destructive replacement, disclosure
boundary, or concurrent ownership is materially ambiguous.

## Project an exact plan

Enter `plan-projection` only on explicit authorization. The plan remains the
canonical intended course; derived records coordinate execution.

1. Bind the exact Change, Change Specification, Change Design, and plan
   revisions and the selected plan steps.
2. Give each derived record a stable source-step identity and preserve its
   outcome, scope, affected units, dependencies, constraints, invariants,
   Evaluation feedback, focused-review and upstream-return conditions,
   verification, observability, recovery, delegated choices, blockers, and
   unknowns.
3. Link shared authoritative context rather than independently summarizing it
   into every item.
4. Before mutation, verify that every selected step appears exactly once, no
   record adds scope or authority, dependencies resolve, common revision
   bindings agree, and no upstream blocker has become assigned work.
5. Mutate and read back each item independently. Continue past an item-local
   failure only when safe. Report created, updated, unchanged, failed, drifted,
   and unverified identities without claiming atomic success.

Do not decompose a plan simply because its table resembles tasks. A plan is not
host-native records until this separately authorized projection occurs.

## Unavailable host capability

If the host or mutation tool is unavailable, return the exact host-neutral
payload or mapping, intended target, authorized scope, and required readback
comparison. Mark persistence `unverified`; do not claim that anything was
created or updated.

If the host cannot carry the complete artifact faithfully, retain or establish
another canonical home and use the work item only for a linked synopsis. Do not
compress material meaning to fit an inadequate host.

## Output

Lead with the observed outcome and include only applicable fields:

```text
Mode:
Source artifact and exact revision:
Canonical home:
Target identities:
Authorized mutation scope:
Created, updated, unchanged, failed, or unverified identities:
Fidelity result:
Host normalization or drift:
Concurrent changes preserved or conflicting:
Material gaps and recovery:
```

Completion requires exact source and target attribution, one clear canonical
home, mutation within authority, authoritative readback for every claimed
success, and an honest fidelity result. A prepared payload, submitted request,
or host acknowledgment alone is incomplete.
