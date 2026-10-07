---
observed_at: "2026-10-07T17:57:38.143354Z"
session: "c7e9"
area: "GitHub Actions merge queue"
---

# Merge queue job failed before runner acquisition

## Context

Publication capacity PR #535 passed proposed-change CI and entered the protected merge queue.

## Friction

Merge-group run 37655365734 failed because its CLI verification job was never started. Check annotations reported: "The job was not started because it repeatedly failed to be acquired (5 attempts)." The job had no steps or test log; the PR was dequeued.

## Outcome

Retried the failed jobs on the recorded merge-group revision using `gh run rerun 37655365734 --failed`. The retried CLI job acquired a runner and entered source verification. Recovery remains in progress.

## Evidence

- https://github.com/agentxm/axm/pull/535
- https://github.com/agentxm/axm/actions/runs/37655365734
- Original CLI job: 112909255903.
- Recorded merge-group revision: `4a58dab5adb117508b1d15a3b5210c899b15990a`.
