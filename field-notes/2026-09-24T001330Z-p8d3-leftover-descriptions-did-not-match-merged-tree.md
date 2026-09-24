---
observed_at: "2026-09-24T00:13:30Z"
session: "f6efa5b7-6d4a-4069-9285-9b1fa640211c"
area: "task handoff instructions"
---

# Leftover descriptions did not match the merged tree

## Context

The integration brief named two leftovers. One said the recovery closure renders
a sync failure by its bare tag. The other said contributor text was formatted in
three places.

## Friction

The projection copy of the contributor formatter was already removed by one of
the merged packages, so only one duplicate remained. The recovery closure's
restoration branch never received the described failure. Its failures are
already step failures, and in sync it runs nested in the plan's transaction,
which reports the restoration itself. The described symptom could not be
reproduced, so a discriminating test was not possible.

## Cost / impact

The formatter history was traced across five revisions. One probe test run
recorded the write sequence and plan result to learn where restoration is
reported.

## Outcome

Both leftovers were closed as ownership changes that keep current output. The
new recovery test protects the rendered text but passes on the old code too.

## Evidence

Probe result: plan `atomicity.applied` was `non-rollbackable`. The unit message
was the Pack step's own failure. `recovery.snapshotDir` was set by the plan-level
restoration.
