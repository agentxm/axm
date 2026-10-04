---
observed_at: "2026-10-04T07:37:20Z"
session: "q8m2"
area: "AXM revised-source CI verification"
---

# Four native filesystem cases exceeded their deadlines after local verification passed

## Context

PR #509 source `b604442ca43b84f77d0e90330717fae1709f23d2` passed complete local PR verification, current-main affected verification, and the selected canonical specifications. Hosted CI used Nx 1, Vitest 2, and an isolated temporary directory.

## Friction

Hosted source verification failed four unchanged 20-second cases: installed Pack recovery, stale authored Rule and Knowledge instruction copies, and managed Subagent opaque-body projection. The workspace-features suite reported 3,160 passed, four failed, and one existing skip. Its reported duration was 2,357.50 seconds.

## Outcome

Required CI failed. The PR remained open; no merge or CLI publication followed. The exact failed log was preserved. The other hosted verification jobs passed.

## Evidence

[CI run 37183820610](https://github.com/agentxm/axm/actions/runs/37183820610), source job `111381585695`; `src/sync/lockfile-rejections-name-recovery-routes.spec.ts:117` and `src/sync/projection-currency-follows-state-authority.spec.ts:152,501`.
