---
observed_at: "2026-09-26T06:23:46Z"
session: "c72a"
area: "AXM release-worktree test dependency chain"
---

# Registry-client generation blocked the root test dependency chain

## Context

The release-tag cleanup needed the root `axm:test` target for release and repository task-interface tests.

## Friction

The target's dependency chain stopped at `registry-client:generate:registry-client`: its post-processor reported that `IsoDateTimeString` anchors were absent from generated output. The root test target never ran in that invocation.

## Cost / impact

The normal dependency-aware test route could not provide a full green result. A second target invocation with `--excludeTaskDependencies` ran the requested files, but did not rebuild all dependencies.

## Outcome

The focused invocation reported 21 passing tests; the release-shared suite also reported `spawnSync git EPERM` at suite level. The direct release-metadata target, run with the current candidate and HEAD SHA, succeeded. The generator remains unresolved in this worktree.

## Evidence

The generator error was `IsoDateTimeString anchors not found in generated output`; the focused JSON test report showed 21 passed assertions and one failed suite with `spawnSync git EPERM`.
