---
observed_at: "2026-10-04T02:28:00Z"
session: "q8m2"
area: "AXM release candidate verification"
---

# Isolated release candidate source verification timed out

## Context

The prepared CLI 0.39.0 candidate used per-job isolated scratch directories and the existing Nx concurrency 1 / Vitest workers 2 profile.

## Friction

Required CI failed when the managed Subagent opaque-body projection case exceeded its unchanged 20-second test deadline. The workspace-features suite reported 3,163 passing tests, one failed test, and one skipped test; the failing case took 20,096 ms.

## Cost / impact

The release candidate cannot advance through its required gate. The source job ran for approximately 46 minutes before completing with failure.

## Outcome

Publication has not started. The candidate remains unmerged while the exact failing case is investigated.

## Evidence

- Candidate: `9b509be4a84ddf860d5422f34493030e1bbc23ee`.
- [CI run](https://github.com/agentxm/axm/actions/runs/37168760088), job `111337381630`.
- `packages/core/workspace-features/src/sync/projection-currency-follows-state-authority.spec.ts`: `applies the same opaque-body contract to managed Subagent documents`.

## Existing context

The preceding controlled Rule projection probe passed in a clean temporary root, exceeded the same deadline with 2,000 added siblings, and passed after removing those siblings. That experiment does not establish the cause of this separate candidate failure.
