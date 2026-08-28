---
type: Guide
title: Running a change-realization stage
description: Use after a person explicitly selects a focused Gen Stack stage for one bounded software change; apply the shared artifact lifecycle, event-driven persistence, exact predecessor acceptance, authority, and recoverable handoff contract without automatically advancing the workflow.
tags: [process, software-change, stage-contract, invocation, artifact-lifecycle, persistence, acceptance, open-items, authority, provenance, compaction]
status: draft
sources:
  - id: process-definition
    resource: deciding-and-realizing-software-changes.md
    title: Deciding and realizing bounded software changes
  - id: gen-stack-overview
    resource: ../overview.md
    title: How the Gen Stack operates
generated:
  by: codex/gpt-5.6
  at: 2026-08-28T20:00:00Z
---

# Running a change-realization stage

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](../glossary.md) and the recommended
> relationships in [Deciding and realizing bounded software
> changes](deciding-and-realizing-software-changes.md). It does not grant
> Requirement, Architecture, mutation, priority, assignment, or release
> authority.

Apply this common contract before the focused Shape, Spec, Design, Plan, or
Implement Guide. The focused Guide owns artifact-specific meaning; this Guide
owns the common lifecycle, persistence, acceptance, invalidation, and handoff
behavior.

## Invocation and authority

| Capability | Selection policy | Responsibility |
| --- | --- | --- |
| `gen-stack` | Implicit or explicit | Explain and orient the method, corpus, and coordination surfaces |
| `$shape`, `$research`, `$investigate`, `$spec`, `$design`, `$plan`, `$implement`, `$review`, `$ship` | Explicit only | Perform one focused stage |
| `$quick-change` | Deprecated explicit compatibility route | Recommend `$spec` followed by `$design`; perform neither |
| `sync-change` | Implicit or explicit | Perform a user-requested manual checkpoint or repair for one exact artifact |
| `researcher`, `reviewer` | Internal delegation only | Perform fresh-context work owned by an activated skill |

`$stage` is host-neutral shorthand for deliberate selection. Natural-language
similarity, a completed artifact, or a next-route recommendation does not
activate a focused stage. A valid forward-stage invocation has one additional,
bounded effect: it accepts the exact persisted `Ready` predecessor named below.
It does not activate any stage after itself.

Stage selection, artifact acceptance, semantic ratification, repository
mutation, priority, assignment, and release are separate authorities. Establish
each one that the requested action needs.

## Shared artifact lifecycle

Pitch, Change Specification, Change Design, and implementation plan use exactly
three states:

| State | Meaning |
| --- | --- |
| `Draft` | Useful current work exists, but one or more open items, persistence conditions, or coherence checks block dependent acceptance |
| `Ready` | The exact persisted artifact is complete for its named next-stage consumer and has no open items |
| `Accepted` | A valid invocation of the named forward stage accepted that exact persisted `Ready` revision |

These states govern the focused artifact, not the Change's delivery, review,
verification, release, or closure. They also do not replace governed lifecycle
terms such as active or retired Requirement, accepted Architecture decision, or
host-native workflow state.

Update the current artifact in place. Do not create a successor copy or expose a
`superseded` artifact state. Preserve exact content or revision identity in
history or host revisions so decisions and readback remain attributable.

### Presentation contract

Pitch, Change Specification, Change Design, and implementation plan use one
portable first-screen order:

```markdown
# <Artifact class>: <bounded subject>

> **Artifact:** <stable identity and exact revision>
> **State:** `<Draft | Ready | Accepted>`
> **Canonical:** <work item, native field set, body region, or exact link>
> **Bound to:** <exact predecessor identities and states; omit when none>

## Summary

<The authoritative short statement of what this artifact establishes.>

## Open items

- None.
```

The first screen lets a reader identify the artifact, exact revision, state,
canonical home, upstream bindings, established meaning, and blockers before
reading detail. `Summary` owns the concise statement; later sections add detail
without restating it.

Change coordination uses the same reading order with `Change`, `Canonical`,
and `Coordination` metadata followed by Summary, Next, and Current artifacts.
Review and Ship are outcome records rather than focused-lifecycle artifacts;
Review leads with Subject, Mode, Focus, and Result before Decision, while Ship
leads with Subject, Action, Target, and Outcome before Summary.

Use this shared visual key without collapsing its independent dimensions:

| Dimension | Portable keys |
| --- | --- |
| Focused artifact state | `Draft`, `Ready`, `Accepted` |
| Persistence result | `VERIFIED-EXACT`, `VERIFIED-FAITHFUL`, `DRIFT`, `UNVERIFIED` |
| Review disposition | `SUPPORTED`, `ACTION REQUIRED`, `UNKNOWN`, `NOT APPLICABLE` |
| Evaluation Result | `pass`, `fail`, `unknown` plus method-specific states defined by its Protocol |
| Stable references | `OI-<n>` open item, `A-<n>` required action, `F-<n>` finding, `U-<n>` material unknown |
| Transition or dependency | `→` |
| Explicit absence | `None` for no entries, `No change` for a considered unchanged semantic dimension, `—` only for an empty compact-table cell |

One key has one meaning everywhere. Text labels are mandatory; color, emoji,
typography, or a host badge never carries meaning alone. Canonical headings do
not contain decorative emoji. A host projection may add restrained decoration,
and `⚠` may call attention to an exceptional conflict, drift, or unverified
write, but neither changes the portable key. `—` never means `UNKNOWN`.

Use progressive detail:

1. header, Summary, and Open items for a thirty-second scan;
2. boundaries, decisions, mappings, and risks for a decision read; and
3. exact authorities, evidence, realization detail, and linked sources for
   verification.

Keep required control sections. Give every required semantic dimension an
explicit disposition such as `No change.` when appropriate. Omit optional
detail when immaterial instead of emitting empty headings or `Not applicable`
scaffolding. Use tables only for short parallel comparisons, with no more than
four columns in the portable fallback; use vertically labeled cards for work
steps, actions, findings, and checkpoints.

### Open items

Every artifact contains an explicit `## Open items` section.

- `Draft` contains one bullet per unresolved blocker.
- `Ready` and `Accepted` contain exactly `- None.`
- Give each blocker a stable identity when another artifact, handoff, or turn
  may need to reference it. Use this portable shape:

  ```markdown
- **OI-1 — <blocker>**
  - **Authority:** <responsible role>
  - **Resolves when:** <observable condition>
  ```

Questions, risks, deferred improvements, and non-blocking follow-up may remain
elsewhere. Put an item here only when it blocks the artifact's next acceptance.

### Readiness

An artifact becomes `Ready` only when:

- its focused Guide's completion conditions hold;
- its exact current content is in one durable canonical target;
- authoritative readback verifies the persisted content and state;
- `Open items` is empty; and
- its upstream bindings are current and coherent.

Polish, conversation history, a write response, an echoed payload, or a host
workflow field does not establish readiness.

## Canonical target and persistence

The person remains responsible for establishing a durable canonical target,
usually one Change work item whose native fields, artifact regions, or links
carry the current Pitch, Specification, Design, and plan. A repository artifact
may be canonical when the work-item host cannot faithfully carry it; the work
item then holds one linked synopsis rather than a second editable copy.

At stage start:

1. resolve the canonical target and inspect its native representation,
   permissions, current revision, and concurrency behavior;
2. bind the exact predecessor and current artifact region or link;
3. recover the current persisted artifact after context compaction instead of
   relying on conversational memory; and
4. if no writable durable target exists, continue only to a useful `Draft` and
   add the missing target as an open item. Such a Draft cannot become `Ready`.

Persist the first coherent Draft immediately. A coherent Draft has a stable
artifact identity, bounded purpose, honest current content, state, and open
items; it need not be complete. Verify authoritative readback before claiming
that persistence succeeded.

Ordinary conversational iteration does not trigger persistence. This is a
deliberate user-responsibility boundary: if later chat-only edits are lost to
compaction, report the last persisted exact revision and require the user to
supply or recreate the missing content. Never reconstruct it from likely
intent.

## Persistence events

Use the focused stage's available work-item integration directly for lifecycle
events. Do not invoke or route through `sync-change` as an automatic follow-on.

| Event | Required action |
| --- | --- |
| First coherent artifact Draft | Persist and read back `Draft` immediately |
| Express state change | Persist the exact new state and content, then read back |
| Valid forward-stage invocation | Persist predecessor `Ready → Accepted` before dependent work, then read back |
| Material edit to `Ready` or `Accepted` | Persist `→ Draft`, add open items, invalidate dependents, then read back |
| User explicitly requests a checkpoint | Use `sync-change` with the exact artifact |
| Ordinary chat refinement without a state change | Do not write |

When a lifecycle write is authorized but unavailable, report persistence as
`UNVERIFIED` or failed, keep the artifact `Draft`, and name the recovery
condition. Do not replay a write whose outcome is unknown.

## Forward acceptance

The valid forward stage accepts only this predecessor:

| Invocation | Required predecessor effect |
| --- | --- |
| `$spec` | Accept exact persisted `Ready` Pitch |
| `$design` | Accept exact persisted `Ready` Change Specification |
| `$plan` | Confirm the Specification is `Accepted`, reconcile exact bindings, then accept exact persisted `Ready` Change Design |
| `$implement` | Confirm bound Specification and Design are `Accepted`, then accept exact persisted `Ready` plan before mutation |

Acceptance must happen before dependent work. Stop when the predecessor is
`Draft`, unpersisted, stale, concurrently changed, cannot be read back, or has
open items. Never accept a summary, inferred revision, or chat-only artifact.

Acceptance approves the predecessor for its declared consumer. It does not
silently accept governed Requirement or Architecture meaning outside that
artifact's authority, grant implementation mutation, or approve release.

Direct entry remains valid. When no predecessor exists, the focused stage may
produce a truthful Draft from authoritative inputs, but it cannot claim the
missing predecessor was accepted. Its Open items must expose any missing
authority or coherence needed for `Ready`.

Review does not accept Implementation. Ship remains an explicit, separately
authorized final action.

## Invalidation

Any material change to a `Ready` or `Accepted` artifact:

1. changes that same artifact to `Draft`;
2. records the reason and required re-decision in `Open items`;
3. persists and verifies the downgrade in place;
4. marks every dependent artifact `Draft` when its binding or reasoning may no
   longer hold; and
5. requires the normal forward acceptance sequence again.

Representation-only maintenance that demonstrably preserves meaning does not
downgrade state. Concurrent edits to the same canonical location stop the write
for reconciliation.

## Execute the focused responsibility

Bind exact sources, accepted meaning, current implementation, evidence,
permissions, and the stopping condition. Produce the smallest sufficient
focused outcome. Return changed desired state, durable Architecture, or
Evaluation Protocol meaning to its authority. Local reversible choices may
proceed only inside accepted meaning and delegated action authority.

Classify any corpus effect as `no-impact`, `consulted`, `candidate-gap`,
`accepted-semantic-delta`, `representation-maintenance`,
`realization-or-evidence-update`, or `compaction-opportunity`. Do not expand an
artifact stage into unrelated corpus cleanup.

## Verify and hand off

Verify focused completion, exact identities, authoritative readback, performed
versus planned evidence, intended versus observed effects, and any corpus
mutation. Preserve `unknown`, partial success, conflicts, and tool failure.

Use this minimal handoff:

```
Artifact: <class, identity, exact revision> · <Draft | Ready | Accepted>
Canonical: <target> · <VERIFIED-EXACT | VERIFIED-FAITHFUL | DRIFT | UNVERIFIED>
Open items: <None | stable IDs>
Next: <eligible action or recovery> · <acceptance effect when one exists>
```

Add focused evidence or authority detail only when it is material to the next
decision. Link canonical sources instead of copying them. A next eligible
action is a recommendation, not invocation.

## Final check

- The artifact uses only `Draft`, `Ready`, or `Accepted`.
- Its first screen follows the common header, Summary, and Open-items order.
- The first coherent Draft and every state change were persisted and read back,
  or the exact persistence failure remains an open item.
- Ordinary chat iteration caused no write.
- `Open items` agrees with state.
- Any forward acceptance used the exact persisted Ready predecessor and
  occurred before dependent work.
- Material upstream changes invalidated affected current artifacts in place.
- Semantic, mutation, and release authority were not inferred from artifact
  state or workflow position.
- Visual keys preserve their declared dimensions and never depend on emoji or
  color alone.
- The handoff is sufficient to recover after compaction.
