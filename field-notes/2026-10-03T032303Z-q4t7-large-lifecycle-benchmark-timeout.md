---
observed_at: "2026-10-03T03:23:03.841057+00:00"
session: "unknown"
area: "lifecycle benchmark collection"
---

# Large lifecycle sample exceeded the harness deadline

## Context

The candidate fixture 9 campaign measured sizes 1, 10, 50, and 200 serially, with separate control and diagnostic modes.

## Friction

All 82 samples through size 50 passed. The first size-200 control cold sync was killed at 600066 ms by the ten-minute harness deadline, leaving an incomplete 83-sample report. The entire campaign took 47m 24s.

## Outcome

Retained the partial report and added a validated configurable command deadline to fixture 10. A fresh same-fixture baseline/candidate comparison with a longer deadline remains pending. No product latency claim follows from this timeout.
