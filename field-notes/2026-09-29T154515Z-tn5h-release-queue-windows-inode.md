---
observed_at: "2026-09-29T15:45:15Z"
session: "tn5h"
area: "AXM CLI release merge queue / Windows workspace lifecycle"
---

# Windows identity check stopped the release queue

## Context

The generated AXM CLI v0.37.0 release PR passed its head CI and entered the merge queue after the native-locations source change reached main.

## Friction

The queue's Windows workspace lifecycle job failed during `mcps add windows-demo`. Writing a temporary `axm.json` failed with `NativeLocationError` reason `unreadable`, cause `entry-identity-unavailable`.

## Cost / impact

The release candidate could not merge or publish. A separate source fix and another release candidate are required.

## Outcome

The failed Windows JUnit artifact was preserved, and a source fix is under verification in an isolated worktree.

## Evidence

GitHub Actions run `36592023435`, job `109487532515`, artifact `test-results-windows-workspace-e160b7a81390b46c520d19ff4ecdd48b15b35c80`; PR `agentxm/axm#481`.

## Existing context

The installed Effect Node FileSystem converts native bigint inode values to an optional JavaScript number, which is absent when the value is outside the safe integer range. The observed failure is consistent with that conversion.
