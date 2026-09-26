---
observed_at: "2026-09-26T04:37:23Z"
session: "unknown"
area: "CLI end-to-end Registry publication"
---

# File-backed publish example could not pass its source-state probe

## Context

this consolidation replaced a hand-written file-backed Registry fixture in the directory-selection process specification with publication through the built CLI.

## Friction

The new example reached `skills publish` but the prepared candidate failed with “Could not assess the published source state.” The temporary publisher workspace was under `/tmp`, where a mounted `/tmp/.git` had already affected outside-Git tests in this session. The publish path consults `GitDirectoryComparison` before applying.

## Cost / impact

The directory-selection example did not establish process-level evidence. Two retries with improved command output and an existing Registry directory produced the same failure; the first run of the two-file e2e selection passed two cases and failed 22, with 21 other failures reporting loopback `listen EPERM`.

## Outcome

The process test remained blocked in this environment. Workspace, CLI, and Registry-client focused tests for the shared file Registry passed.

## Evidence

`pnpm exec nx run cli-e2e:e2e-main --excludeTaskDependencies --args="src/relative-paths-start-in-selected-directory.spec.ts -t 'uses the Registry selected by settings in the selected directory' --reporter=json --outputFile=/tmp/axm-work-step54-relative-results.json"` reported exit 10 from `skills publish` and the source-state assessment message. The corresponding code path is `packages/core/workspace/src/publishing/publish/use-case.ts:302` through `GitDirectoryComparison`.
