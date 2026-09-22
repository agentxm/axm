---
observed_at: "2026-09-22T20:26:50Z"
session: "h8v2"
area: "verification"
---

# CI exposed timing-dependent Pack metadata batching

## Context

The first CI run for AXM PR #418 followed passing local lifecycle specifications
and the full PR verification workflow in an isolated macOS worktree.

## Friction

Linux E2E shard 2 failed the shared-Pack specification: two configured Pack
indexes arrived in separate metadata requests. The local benchmark comparison
also recorded a one-request variation in an overlapping-Pack scenario.

## Cost / impact

The failure required another implementation and verification pass before the
PR could become ready. Re-running the unchanged CI job would not repair the
observed batching behavior.

## Outcome

A controlled workspace-read delay reproduced the split on the baseline. The
same test passed after separating Pack preparation from Registry selection.
Continued with CLI and performance verification before another push.

## Evidence

- CI run `35776641100`, job `106911583594`.
- Local reproduction: `/tmp/axm-pack-batch-before.log`.
- Local fixed test: `/tmp/axm-pack-batch-after.log`.
