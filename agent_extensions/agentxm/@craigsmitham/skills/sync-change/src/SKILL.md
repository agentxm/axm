---
name: sync-change
description: Manually synchronizes one exact current Gen Stack Pitch, Change Specification, Change Design, or plan into its canonical work-item target after explicit persistence intent. Use for a user-requested checkpoint or repair when the complete exact source and target are available. Not for automatic lifecycle writes, reconstruction after compaction, plan-to-task projection, authoring, acceptance, implementation, review, or release.
---

# Sync change

Select when the user explicitly asks to persist, sync, copy, create, update, or
repair one exact current artifact. Exact landed source plus explicit
persistence intent may select it implicitly. Stage completion, workflow
position, rough notes, a summary, or missing source content does not.

Read through active AXM scope; in this workspace read:

1. `knowledge/gen-stack/src/work-items/synchronizing-change-artifacts.md`;
2. `knowledge/gen-stack/src/processes/running-change-realization-stages.md`;
3. `knowledge/gen-stack/src/work-items/preserving-work-item-evidence-and-authority.md`.

## Boundary

Sync Change is the manual checkpoint and repair path. Active Shape, Spec,
Design, and Plan stages write their own initial Draft and lifecycle events
without invoking this skill.

This skill copies exact artifact state; it never changes `Draft`, `Ready`,
or `Accepted`, resolves Open items, accepts an artifact, or creates semantic
authority. It can synchronize one plan as an artifact but cannot expand it into
derived host-native implementation records.

## Synchronize

1. Resolve the complete source, exact identity, state, Open items, canonical
   target, upstream bindings, and decisions. Stop if any are unavailable.
2. After compaction, treat canonical readback as the last recoverable exact
   revision. If later chat-only edits were lost, require the user to supply or
   recreate them. Never reconstruct likely content or state.
3. Inspect native host semantics, permissions, format, limits, relationships,
   update behavior, and concurrency controls.
4. Choose one canonical complete representation. Use only a linked state
   synopsis when another artifact is canonical.
5. Resolve exact item, fields, relationships, and body region authorized for
   mutation. Do not infer title, workflow, label, priority, assignment,
   estimate, or hierarchy changes.
6. Read immediately before writing. Stop on concurrent change to the same
   artifact region; preserve unrelated content.
7. Write the smallest coherent update in place. Repeating the same exact source
   is unchanged. Never replay an unknown outcome.
8. Read back authoritative persisted state and compare identity, structure,
   content, state, Open items, decisions, authority, bindings, and mutation
   scope.
9. Report `VERIFIED-EXACT`, `VERIFIED-FAITHFUL`, `DRIFT`, or `UNVERIFIED`.

A write response or echoed payload is not readback. Do not call `DRIFT` or
`UNVERIFIED` persistence successful.

## Failure

If no mutation capability exists, return the exact host-neutral payload and
report `UNVERIFIED`. If the host cannot preserve the artifact, retain another
canonical home and use a linked synopsis. Never create a superseded artifact
copy.

Stop after the synchronization result. Do not activate another stage.
