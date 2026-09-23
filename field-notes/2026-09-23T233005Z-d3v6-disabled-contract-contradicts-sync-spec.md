---
observed_at: "2026-09-23T23:30:05Z"
session: "f6efa5b7-6d4a-4069-9285-9b1fa640211c"
area: "delegated design brief for canonical observation"
---

# A delegated design decision contradicted accepted sync behavior

## Context

Implemented a single canonical-observation judgment from a delegated brief.
The brief recorded one decision as accepted: every disabled desired node
observes as not applicable. Its rationale said every acquiring operation skips
disabled entries.

## Friction

Sync materialization selects disabled sourced nodes. It acquires their
canonical content when the observation is not usable. The accepted
specification `cli/sync/realizes-desired-state` requires that for disabled
entries, and `cli/activation-follows-desired-state` requires that disabling
preserves canonical content and the accepted resolution. Uninstall, re-enable,
and the per-type managers also read disabled nodes' observations. Applying the
decision as written would have conflicted with both specifications.

## Cost / impact

Work on the decision paused while the conflict was checked against sync,
uninstall, re-enable, and manager consumers. Three messages went to the
delegating agent. No reply had arrived when implementation resumed, so the
choice was made under an assumption.

## Outcome

Implemented a narrower rule. A disabled node observes as not applicable only
when its accepted resolution is absent. A disabled node that has one keeps its
full observation. The narrowed rule was reported for confirmation.

## Evidence

`packages/core/workspace/src/reconciliation/materialize.ts` selects nodes with
`.filter((node) => node.type !== "pack" || !node.enabled)` and computes
`materialize = observation.status !== "usable" || (node.enabled && !materializationCurrent)`.
`packages/core/workspace/src/reconciliation/sync/realizes-desired-state.spec.ts`
asserts that the canonical path exists after syncing a disabled entry.
