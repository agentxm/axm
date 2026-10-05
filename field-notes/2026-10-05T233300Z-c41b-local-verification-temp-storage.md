---
observed_at: "2026-10-05T23:33:00Z"
session: "c41b7d2e"
area: "local affected verification"
---

# Temporary storage and test deadlines complicated local verification

## Context

Running the affected workflow for skill-install telemetry in an isolated worktree while other workspaces were active on the host.

## Friction

Setting `TMPDIR` under `/dev/shm` made the cross-filesystem publication test use the same filesystem for both sides. Restoring normal temporary storage corrected that setup, but an existing 100-case MCP property test exceeded its explicit 30-second timeout in the broad run and in isolation. A per-user memory filesystem had a distinct device from `/dev/shm`; the MCP file's 74 tests and the cross-filesystem test passed there in focused runs.

A later broad run with that directory and serial Nx tasks again timed out the MCP property test and also failed the separate-process contention specification with `WorkspaceDirectoryError` / `runtime-parent-changed`. It reported 2,235 passing tests, two failures, and three skips. No assertion or deadline was weakened.

## Cost / impact

Two affected retries took 9m27s and 5m11s, respectively, without completing the downstream suites. Additional focused runs were needed to distinguish filesystem setup from test outcomes.

## Outcome

The branch was subsequently rebased for an independent toolchain conflict. Local verification continues on that reconciled revision, retaining the per-user temporary directory and collecting the complete affected result without stopping at the first failed task.
