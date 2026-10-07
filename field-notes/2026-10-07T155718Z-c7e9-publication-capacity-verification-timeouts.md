---
observed_at: "2026-10-07T15:57:18Z"
session: "c7e9"
area: "affected verification"
---

# Affected verification hit three workspace-kernel timeouts

## Context

Verifying an increase in the publication-set candidate bound from 100 to 200.
Focused protocol tests and type checks passed.

## Friction

`pnpm run verify:affected` failed in `workspace-kernel:test`. Three tests exceeded
five seconds: captured external native-root withdrawal rollback, new instruction
container withdrawal, and HTTP retained-entry limits across archive offers.

## Cost / impact

The workflow ran for 3m 1s and stopped before all affected checks finished.

## Outcome

The workflow was terminal. Isolated reproduction of the three files was selected
as the next action; no timeout or required check was weakened.

## Follow-up evidence

The existing hosted-CI profile passed the workspace-kernel suite (2,336 tests),
but complete affected verification then stopped after 20m 28s on the CLI sync
test for pruning disabled managed MCP configurations. That test exceeded the
profile's 20-second timeout; 3,604 other CLI tests passed.

The same focused test timed out both with this change and with the original
100-candidate protocol restored. No timeout was increased, test excluded, or
required check bypassed. Pull-request CI remains the next complete evidence.
