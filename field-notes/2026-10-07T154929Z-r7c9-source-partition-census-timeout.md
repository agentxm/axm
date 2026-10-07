---
observed_at: "2026-10-07T15:49:29Z"
session: "r7c9"
area: "Source verification partitions"
---

# Source partition census exceeded its test deadline

## Context

Investigate release-readiness and source CI improvements on PR #534 at
`9d4548367e8973d4b4fc7fbd705d913f783dc894`.

## Friction

PR run 37645159034 failed its remaining-projects partition because
`keeps complete source coverage across independent verification partitions`
exceeded the 20-second test deadline. The report recorded 21.583 seconds and
555 passed tests out of 556. The census invokes Nx nine times for four distinct
project selections.

## Outcome

The same test passed in full run 37645252479 in 18.455 seconds. A focused local
execution through `axm:test` passed in 7.406 seconds. The PR failure remains
unresolved; investigation did not change implementation.

## Evidence

- https://github.com/agentxm/axm/actions/runs/37645159034/job/112874881072
- https://github.com/agentxm/axm/actions/runs/37645252479/job/112875195834
- `scripts/ci-workflow.test.ts`: source partition census.
