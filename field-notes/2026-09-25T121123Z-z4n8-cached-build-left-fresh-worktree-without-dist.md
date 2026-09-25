---
observed_at: "2026-09-25T12:11:23Z"
session: "z4n8"
area: "Nx test dependencies in a fresh Git worktree"
---

# Cached builds left a fresh worktree without package output

## Context

The focused `workspace:test` target was run after `pnpm install` in a new AXM worktree.

## Friction

Nx reported dependency builds as local cache hits, but `packages/supporting/registry-client/dist` was absent. Vitest could not resolve `@agentxm/registry-client/testing`. Rebuilding that package alone exposed another absent cached output, `@agentxm/extension-content/lint`.

## Cost / impact

Two test runs stopped before collecting tests. The complete uncached `workspace:test` dependency chain took 35.5 seconds and then reached the expected failing assertion.

## Outcome

Running the focused target with `--skip-nx-cache` built the missing outputs and reproduced the sync warning defect.

## Evidence

The first run reported `Cannot find package '@agentxm/registry-client/testing'`; the second reported `Cannot find package '@agentxm/extension-content/lint'`. Both followed Nx dependency cache hits in this fresh worktree.
