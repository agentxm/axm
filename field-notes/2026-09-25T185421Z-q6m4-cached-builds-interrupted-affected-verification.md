---
observed_at: "2026-09-25T18:54:21Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "Nx affected verification in a fresh AXM worktree"
---

# Cached builds interrupted affected verification

## Context

Step 1's focused lint, source-hygiene test, unused-code check, and negative ESLint check had passed. `pnpm run verify:affected` was then run in the new isolated worktree.

## Friction

The first run failed at `cli-maintenance:typecheck` because `out-tsc/reporting/vitest.execution.d.ts` and `vitest.reporting.d.ts` were absent after a cached `axm:build-test-reporting`. After a fresh build, the next run failed at `cli:typecheck` because `tools/test-support/dist/src/index.d.ts` was absent after a cached `test-support:build`.

## Cost / impact

Two broad verification runs ended before the planned step could be committed. Three narrower build or typecheck commands were used to restore and confirm the required outputs.

## Outcome

`axm:build-test-reporting --skip-nx-cache`, `test-support:build --skip-nx-cache`, and `cli:typecheck` succeeded. The full affected workflow still needed a passing run at capture.

## Evidence

The first failure was `TS6305` for the reporting declarations. The second included `TS6305` for `tools/test-support/dist/src/index.d.ts` and dependent type errors; the subsequent `cli:typecheck` passed.
