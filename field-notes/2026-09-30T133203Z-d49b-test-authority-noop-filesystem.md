---
observed_at: "2026-09-30T13:32:03.549074+00:00"
session: "d49b"
area: "native writer test layers"
---

# Synthetic filesystem escaped the permissive test authority

## Context

The agent-removal fixture combines real disk state, workspace settlement, and a permissive native-write test authority.

## Friction

Three removal tests failed while writing projection-container receipts. The rendered settings error obscured the underlying cause. A temporary typed-error trace exposed `SettingsWriteError` at `write-temp`, wrapping `WorkspaceSnapshotError` at `inspect-target`, then a filesystem `NotFound` for `readDirectory('/')`.

The permissive authority provided the shared live write-lock layer with a no-op filesystem implementing only `realPath`. Physical spelling resolution now reads directories, and layer memoization allowed that synthetic dependency to reach the real fixture's locks.

## Outcome

The disk-backed removal fixture now uses the live native authority and passes all six tests. The permissive and recording test authorities now use scoped lexical RcMap/Semaphore exclusion directly, preserving resolved path keys and zero idle retention. Existing MCP writer and Subagent tests pass all 37 cases, including same-file concurrent writes and recording. Temporary tracing was removed. Production postcondition checks were preserved.

## Evidence

`apps/cli/src/root/agents/remove.test.ts`; `packages/core/workspace-kernel/src/agent-adapters/testing.ts`; focused `cli:test` and `workspace-kernel:test` results.
