---
observed_at: "2026-10-03T02:36:13.802276Z"
session: "01a0fe98-84a8-74a0-a015-e64fc2e7b44e"
area: "Nx verification"
---

# Overlapping verification builds required a retry

## Context

A focused workspace-features test and a lint/typecheck run were launched concurrently in one worktree. Both declared prerequisite builds.

## Friction

The focused test stopped before execution: workspace-features:build reported TS2305 missing workspace-kernel exports, including Settings and SkillLockEntry. The concurrent static run completed successfully, including that build; Nx reported workspace-features:build as flaky.

## Cost / impact

The failed attempt took 7.5 seconds and supplied no test evidence. The focused target had to be launched again after the static run ended.

## Outcome

Lint and typecheck passed. The focused test is being rerun sequentially. No source change was made for the missing-export diagnostics.
