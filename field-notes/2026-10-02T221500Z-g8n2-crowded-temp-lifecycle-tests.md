---
observed_at: "2026-10-02T22:15:00Z"
session: "01a0fe8f-fd66-7563-a607-1751aa619aab"
area: "lifecycle verification environment"
---

# Crowded temporary directory obscured lifecycle test failures

## Context

Verifying accepted dependency graph changes in an isolated worktree, with a separate unchanged baseline worktree and pinned dependencies installed in both.

## Friction

Lifecycle examples timed out at the workstation five-second limit and the existing CI twenty-second limit. The unchanged baseline also timed out. A bounded syscall trace showed repeated ancestor-directory enumeration, including 1,608 reads of `/tmp` in approximately two seconds; `/tmp` contained 7,337 entries.

## Cost / impact

The initial kernel run reported 20 failures among 1,137 tests. A broad feature run was stopped after hundreds of timeout results; focused baseline and candidate retries were needed to distinguish environment overhead from implementation failures.

## Outcome

Using `TMPDIR=/var/tmp/accepted-graph-tests` and the existing `CI=true` profile, the focused two-file feature run completed 24 tests in 56.10 seconds with 15 passes and nine implementation or fixture failures, without timeouts. The normal five-second profile remained insufficient for several lifecycle examples in both worktrees.

## Evidence

`vitest.execution.ts` defines the workstation and CI timeout profiles. The focused command used the published `workspace-features:test` target with `--maxWorkers=1`.
