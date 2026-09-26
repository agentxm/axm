---
observed_at: "2026-09-26T06:16:03Z"
session: "c72a"
area: "this consolidation work-package guidance and workspace lint"
---

# Tree-integrity test guidance conflicted with the lint boundary

## Context

Position 69 of the accepted work breakdown called for test package trees to use the production integrity algorithm.

## Friction

Its detailed consumer instructions proposed `Effect.runSync(treeIntegrityOf(...))` in test files, while the same work package noted that test files must not start nested Effect runtimes. Workspace lint rejected the resulting calls under `no-restricted-syntax` with the message to return Effects from `it.effect` or `it.live`.

## Cost / impact

The initial consumer edits and parity test needed a second pass, followed by another build, typecheck, format, lint, and focused test run.

## Outcome

The synchronous runtime call now lives in a `desired-state/test-support` adapter; test files use that helper. Workspace lint passed after the move.

## Evidence

The first JSON lint run reported the nested-runtime rule in seven workspace test files. A later lint run then rejected the adapter in `desired-state/testing.ts` under the process-entry rule; placing it in `desired-state/test-support/tree-integrity-sync.ts` passed lint.
