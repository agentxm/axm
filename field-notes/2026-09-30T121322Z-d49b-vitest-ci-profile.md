---
observed_at: "2026-09-30T12:13:22.892055+00:00"
session: "d49b"
area: "repository test execution"
---

# Worker environment variable did not select the CI test profile

## Context

Focused native-output regression checks used Nx with NX_PARALLEL=2 and VITEST_MAX_WORKERS=2, intending to match CI worker bounds.

## Friction

The checks still used workstation five-second deadlines and several existing lifecycle controls timed out. A sequential file retry passed the direct-removal control in 1964ms but the Hook control again timed out at 5033ms. Inspection by the coordinating agent established that vitest.execution.ts explicitly selects workers and deadlines from CI, so VITEST_MAX_WORKERS was not a reliable way to select that profile.

## Cost / impact

Two focused runs required follow-up timing review and a profile correction. The first two-file run took 79 seconds; the sequential file retry took 65 seconds. These durations include test work, not only overhead. The source of each individual delay was not established.

## Outcome

Subsequent verification uses CI=true and NX_PARALLEL=2, selecting the existing two-worker, twenty-second profile. No test deadline source was changed.
