---
observed_at: "2026-09-23T23:41:00Z"
session: "f6efa5b7-6d4a-4069-9285-9b1fa640211c"
area: "task brief for planner policy consolidation"
---

# Claimed omitted-activation defect did not reproduce

## Context

The task brief described selective skill and subagent update as treating an
omitted `enabled` as disabled, because both test a truthy `entry.enabled`.

## Friction

Those planners read configured record rows, whose `enabled` is a required
boolean derived from the row's activation, so an omitted setting already reads
as enabled. Confirming this took reads of the row type and its reader before
the filter change could be scoped.

## Cost / impact

Three extra file reads. The regression examples added for the brief were not
run against the unchanged filter.

## Outcome

Both planners now filter through `acquisitionConfiguredEntries` for
consistency, and the examples guard the behavior.

## Evidence

`read-model-record-types.ts` declares `enabled: boolean` on configured rows;
`read-model-record-readers.ts` sets `enabled: row.activation === "enabled"`.
