---
observed_at: "2026-10-02T23:30:00Z"
session: "s8m2"
area: "Nx verification orchestration"
---

# Overlapping target runs lost dependency build output

## Context

Focused process and feature tests were launched as separate Nx invocations in the same worktree while both depended on clean TypeScript builds.

## Friction

The CLI build reported missing workspace-features declaration modules while the other invocation rebuilt that dependency. A process invocation also reported an unavailable extension-model module from unbundled output.

## Outcome

Subsequent Nx invocations are serialized. The process test uses the repository's selected CLI artifact runner instead of the directory fixture's unbundled runner.
