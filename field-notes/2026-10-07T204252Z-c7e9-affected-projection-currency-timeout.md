---
observed_at: "2026-10-07T20:42:52.897834+00:00"
session: "c7e9"
area: "Local affected verification"
---

# One projection-currency case exceeded the CI timeout

## Context

Retried the full published affected workflow for source revision `46310b0456dc6c1b7d35d2312b2f61d509f7cfa4` with fresh execution, the existing CI test profile, and a dedicated Nx cache directory.

## Friction

The workflow ran for 30 minutes 27 seconds, then failed one workspace-feature specification: `blocks an owned instruction copy while authored rule content is stale`, in `src/sync/projection-currency-follows-state-authority.spec.ts`. It exceeded the existing 20-second test timeout. The project reported 3,186 passing tests and one skipped test. CLI passed 3,605 tests and root automation passed 545 tests.

## Outcome

Preserved the full failure log and selected the unchanged failing case for an isolated retry. Complete hosted PR CI had passed on the same source revision; queue verification remains in progress. No timeout or required gate was changed.

## Evidence

- Full-run elapsed: 30m27s.
- Workspace-feature test elapsed: 26m26s.
- Hosted PR CI: https://github.com/agentxm/axm/actions/runs/37677793542
