---
observed_at: "2026-10-06T00:35:48Z"
session: "unknown"
area: "local affected verification"
---

# Local projection tests exceeded their five-second budget

## Context

Run `pnpm run verify:affected` on the Library contract candidate rebased onto stable-Effect main `ac2440476bd085813919828c9d456cd034700097`.

## Friction

The unchanged HookManager test “coalesces compatible readers of one aliased native Hook file” and RuleManager test “re-renders an authored body edit and converges on repeat runs” timed out at 5,000 ms. Nx failed `extension-kinds:test`, interrupted `workspace-kernel:test`, and skipped remaining tasks. The workflow exited 130 after 1m 55s.

## Outcome

The owning target passed both files and all 20 cases with `--maxWorkers=1`, keeping the existing timeout. The rerun took 48.3s; the RuleManager edit/convergence case took 4,151 ms. Complete affected verification still needs to finish.

## Evidence

`pnpm exec nx run extension-kinds:test --args='src/hooks/manager.test.ts src/instructions/manager.graph-projection.test.ts --maxWorkers=1'` passed on `c954904d2c42306a1c886c60431bb143a8de8866`. The shared `vitest.execution.ts` declares the workstation and CI execution profiles.
