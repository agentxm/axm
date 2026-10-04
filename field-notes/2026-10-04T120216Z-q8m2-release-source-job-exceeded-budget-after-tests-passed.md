---
observed_at: "2026-10-04T12:02:16Z"
session: "q8m2"
area: "Release-candidate source verification"
---

# Source job exceeded its budget after tests passed

## Context

Release candidate `e4a707171dfa20683610673d28c40b9f4c76166c` ran the proposed-change CI gate with Nx concurrency 1, two Vitest workers, and a 60-minute job limit.

## Friction

GitHub marked the source job cancelled with “The job has exceeded the maximum execution time of 1h0m0s.” Required CI failed, preventing release admission, although every source-job step reported success.

## Cost / impact

The source phase ran from 11:03:58 to 12:01:02 UTC. Its report recorded 11,963 passed tests, four skipped tests, and zero failed tests. Workspace-feature tests took 2,156.19 seconds; CLI tests took 575.20 seconds. The job ran from 11:01:35 to 12:02:11 UTC.

## Outcome

The failed gate was preserved without rerunning or enqueueing the candidate. A separate worktree was created to address the verification budget.

## Evidence

[CI run 37197149763](https://github.com/agentxm/axm/actions/runs/37197149763), source job `111421726296`, Required CI job `111431706908`.
