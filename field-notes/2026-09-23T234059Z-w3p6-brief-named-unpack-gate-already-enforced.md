---
observed_at: "2026-09-23T23:40:59Z"
session: "f6efa5b7-6d4a-4069-9285-9b1fa640211c"
area: "task brief for planner policy consolidation"
---

# Brief listed unpack as ungated, but completeness already refused it

## Context

The task brief listed unpack (promote) among planners that never pass the
constraint gate and asked for the gate to be added there.

## Friction

A constraint gate was added to `packs/lifecycle/promote-authored-pack.ts`, then
found unreachable: the desired-state graph reports `complete` only when it has
no problems, a constraint conflict is a problem, and unpack already refuses an
incomplete graph before any write.

## Cost / impact

One edit was written and reverted. No test ran against the dead branch.

## Outcome

The change was reverted with `git checkout` on that file. Unpack is reported as
already gated by graph completeness.

## Evidence

`desired-state-graph.ts` sets `complete: problems.length === 0`;
`promote-authored-pack.ts` refuses when `!graph.complete`.
