---
observed_at: "2026-10-06T00:57:06Z"
session: "unknown"
area: "local affected verification"
---

# Unchanged MCP property exceeded its thirty-second budget locally

## Context

Run affected verification with the documented CI profile and serial Nx scheduling on `eb2d4b638c61cc61e30a85350186a5005650a9f0`.

## Friction

The unchanged MCP test “preserves write-inspect agreement for arbitrary canonical server names” timed out at 30,000 ms. Its declared property uses 100 runs and seed `0x41584d` (4282445). The kernel suite passed 2,234 cases, with three skips, before this timeout failed the target and stopped the remaining workflow. The affected run took 9m 23s.

## Outcome

An isolated owning-target rerun with `--maxWorkers=1` also timed out at the existing limit. The complete remaining-projects partition of CI run 37395190735 passed on the same revision; complete CI was still running when captured. No MCP source or test budget was changed.

## Evidence

`pnpm exec nx run workspace-kernel:test --args='src/projection/mcps/sync-integration.test.ts -t "preserves write-inspect agreement for arbitrary canonical server names" --maxWorkers=1'` exited 1 after 36.2s. The source is `packages/core/workspace-kernel/src/projection/mcps/sync-integration.test.ts`.
