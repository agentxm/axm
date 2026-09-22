---
observed_at: "2026-09-22T19:44:09Z"
session: "h8v2"
area: "verification"
---

# Passing suites reported worker shutdown timeouts

## Context

Ran `NX_BASE=origin/main NX_PARALLEL=3 VITEST_MAX_WORKERS=2 pnpm run verify:affected`
while verifying lifecycle fixes in an isolated worktree on macOS.

## Friction

After reporting passing tests, Vitest printed `Timeout terminating forks worker`
for `apps/cli/src/screen/interruption-fallback.test.ts` and
`packages/core/workspace/src/desired-state/knowledge/discovery-config.test.ts`.

## Cost / impact

The warnings leave worker shutdown behavior uncertain despite successful test
results. Their separate time cost was not measured.

## Outcome

Verification exited zero: all 51 tasks passed, with 29 served from cache. The CLI
suite reported 3,112 passed tests; workspace reported 4,351 passed and two skipped.
Continued to the final PR checks without repeating the passing suites.

## Evidence

Local command log: `/tmp/axm-stabilization-verify-affected.log`.

A later verification pass also reported shutdown warnings for
`apps/cli/src/utils/fs-helpers.test.ts` and
`packages/core/workspace/src/acquisition/cross-filesystem-source-publishes.spec.ts`.
All 3,112 CLI tests and 4,352 workspace tests passed; the workspace suite skipped
two tests. The workflow exited zero. Those occurrences are in
`/tmp/axm-pack-verify-affected.log`.
