---
observed_at: "2026-10-04T05:32:07Z"
session: "q8m2"
area: "AXM native address optimization"
---

# Ordinary-entry shortcut skipped physical-path refusals in the test adapter

## Friction

An experimental shortcut resolved an ordinary entry through its supplied alias without observing a configured refusal at the physical path. Both existing finite-observation tests for shared typed `realPath` and `stat` refusals failed: they received success where failure was expected.

## Outcome

The shortcut was restricted to entries whose resolved physical path exactly equals their supplied path. Aliases retain the complete physical-route checks. The same focused suite subsequently passed all 85 location and instruction checks, including both refusal cases.

## Evidence

`packages/core/workspace-kernel/src/locations/native-location-set.test.ts`, cases `shares a typed realPath refusal only until the next capture` and `shares a typed stat refusal only until the next capture`.
