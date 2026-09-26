---
observed_at: "2026-09-26T00:57:25Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "affected verification"
---

# Affected verification lost a test worker during concurrent execution

## Context

The affected workflow was verifying a workspace MCP capability consolidation. Its focused tests, typecheck, and lint had passed.

## Friction

The first `pnpm run verify:affected` run reported one 5-second workspace test timeout and a Vitest worker that exited with `SIGTERM` while running `scripts/source-boundary-lint.test.ts`. The workflow exited 130 and did not finish its downstream checks.

## Cost / impact

One full affected-workflow retry was required. The failed run lasted 3m 22s; the serial retry lasted 3m 5s.

## Outcome

The workflow passed on retry with `NX_PARALLEL=1`: workspace tests, all 440 script tests, and all 73 affected tasks completed. Nx marked `workspace:test` flaky.

## Evidence

The first run reported `Test Files 1 failed | 547 passed (548)` for workspace and `Worker exited unexpectedly with signal SIGTERM` for the script suite. The retry reported `Successfully ran targets ... for 16 projects and 11 tasks they depend on`.
