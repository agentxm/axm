---
observed_at: "2026-09-30T12:21:00Z"
session: "227a"
area: "filesystem coordination and Effect testing"
---

# External admission polling inherited a frozen test clock

## Context

Focused lifecycle verification exercised production filesystem coordination through Effect tests.

## Friction

Several lifecycle cases timed out at twenty seconds, and one cleanup hook also timed out. Source inspection found that the shared OS-level admission mutex reused a retry loop with `Effect.sleep`, while `it.effect` supplied a frozen `TestClock`. A brief collision could therefore suspend a retry after the physical holder had released.

## Outcome

Only the external admission acquisition now receives Effect's default live clock. A controlled test holds the real admission mutex, observes a contender, releases the holder, and verifies completion without advancing application time. The unrelated application timer remains frozen until explicitly advanced. This witness and the focused process/workspace controls passed seventeen tests with one volume-dependent skip. Rerunning the original lifecycle workload remains separate evidence; this does not attribute every timeout to the clock mismatch.
