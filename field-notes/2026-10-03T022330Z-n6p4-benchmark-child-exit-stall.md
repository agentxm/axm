---
observed_at: "2026-10-03T02:23:30.873814+00:00"
session: "unknown"
area: "lifecycle benchmark process adapter"
---

# Two diagnostic campaigns stalled after the child exited

## Context

The lifecycle benchmark used Bun 1.3.14's Node child-process interface to run the built CLI, capture three output pipes, and sample RSS. Both stalls occurred in the ten-member diagnostic fixture.

## Friction

A warm-install sample and then an update sample stopped advancing the report. Process inspection showed each CLI child as defunct under the still-running Bun benchmark parent. The compatibility wrapper had not settled the sample. The underlying cause was not established.

## Cost / impact

Two campaigns were interrupted. Their partial reports were retained; neither stalled sample supplied a completed measurement.

## Outcome

Changed the foreign process adapter to native `Bun.spawn`, its exit promise and resource-usage result, and a temporary file descriptor for the existing Node counters. Advanced the fixture version for fresh baseline/candidate comparison. Lint and type checking passed; runtime comparison remained pending at capture.
