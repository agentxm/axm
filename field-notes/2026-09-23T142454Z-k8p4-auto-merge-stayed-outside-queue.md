---
observed_at: "2026-09-23T14:24:54Z"
session: "k8p4"
area: "GitHub merge queue"
---

# Auto-merge stayed outside the queue after checks passed

## Context

A public pull request had auto-merge enabled and all required source checks passed. GitHub reported it as clean and mergeable.

## Friction

The pull request still had no merge-queue entry. Calling `gh pr merge --merge` while auto-merge remained enabled returned successfully but did not enqueue it.

## Cost / impact

The pull request remained open outside the protected queue until a manual disable-auto and merge submission sequence.

## Outcome

`gh pr merge --disable-auto` followed by `gh pr merge --merge` placed the pull request at position 1 in the queue. A second public pull request later entered at position 2.

## Evidence

GitHub reported `mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`, an active `autoMergeRequest`, and `mergeQueueEntry: null` before the sequence; afterward `mergeQueueEntry` reported position 1 and state `QUEUED`.
