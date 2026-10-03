---
observed_at: "2026-10-03T02:32:37.504445+00:00"
session: "unknown"
area: "benchmark memory measurement"
---

# Native subprocess RSS required an explicit unit source

## Context

The replacement benchmark adapter used Bun 1.3.14 subprocess resource usage. The installed Bun types and current Bun documentation describe maxRSS as bytes.

## Friction

Ten-member CLI samples returned maxRSS values of 349376 and 371704, triggering a unit review before accepting memory evidence. The campaign was stopped and its measurements excluded from final comparison.

## Outcome

Moved peak RSS into the Node diagnostic preload using process.resourceUsage().maxRSS, whose documented unit is KiB, and converted it to bytes. Advanced the fixture version and retained identical baseline/candidate harness requirements. Lint and type checking passed; fresh measurements remained pending.
