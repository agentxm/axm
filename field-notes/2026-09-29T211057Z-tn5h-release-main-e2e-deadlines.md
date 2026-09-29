---
observed_at: "2026-09-29T21:05:57Z"
session: "tn5h"
area: "AXM 0.37.1 exact-main CI"
---

# Release main CI missed explicit E2E test deadlines

## Context

The `cli-v0.37.1` release commit passed pull-request and merge-group CI. Its exact-main CI was required before canonical publication.

## Friction

Main CI's CLI E2E shard 2 failed on two explicit test deadlines: the atomic pack-install test exceeded 180 seconds and the sync-convergence specification exceeded 30 seconds. A failed-job rerun on the same release commit passed the pack-install test but again timed out sync convergence at 30 seconds. Successful pull-request and merge-group runs measured sync convergence at 22.3 and 25.2 seconds and pack install at 125 and 148 seconds.

## Cost / impact

The canonical publisher skipped 0.37.1 because exact-main CI was not successful. The private adoption remains paused while a new patch candidate is prepared.

## Outcome

The new source change raises the two test deadlines to 90 and 300 seconds. Its verification is in progress; 0.37.1 was not published.

## Evidence

Exact-main CI run `https://github.com/agentxm/axm/actions/runs/36626860392`, attempts 1 and 2; failed shard jobs `109606137075` and `109614315064`; npm reported no `axm.sh@0.37.1` version.
