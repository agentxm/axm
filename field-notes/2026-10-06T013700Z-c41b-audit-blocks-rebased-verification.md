---
observed_at: "2026-10-06T01:37:00Z"
session: "c41b7d2e"
area: "PR verification prerequisites"
---

# Dependency audit blocks source verification after rebase

## Context

PR #520 passed hosted CI on `9a40622cd`, then required conflict resolution after main adopted the native release distribution change.

## Friction

Both source partitions in run 37399569298 failed at the production dependency audit before running source tests. The audit reported simple-git, its argv parser, and source-map-js advisories. The same repository audit target reproduced the failure locally on rebased revision `217bf58f9`.

## Outcome

Existing PR #523 contains patched dependencies and the associated Git environment adjustment. Integration of #520 waits for that prerequisite change; no audit exception was added.

## Evidence

Hosted run 37399569298, failed source jobs 112063600168 and 112063600206; local `axm:audit:dependencies` output in `/tmp/skill-install-rebased-audit.log`.
