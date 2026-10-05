---
observed_at: "2026-10-05T11:13:02.738616+00:00"
session: "axm039-upgrade"
area: "axm-cli-interactions"
---

# Bundled skill preview misses a native collision

## Context

Recovering the official skill with AXM 0.39.0 in workspaces containing an existing native skill directory or symlink without current ownership proof.

## Friction

`axm skills install @agentxm/skills/axm --bundled --preview --json` reported a ready plan. Applying that plan failed during native materialization and rolled back. The conflicting artifact was present before preview.

## Cost / impact

Recovery required inspecting native artifacts, preserving the conflicting legacy paths outside the workspace, and retrying the operation.

## Outcome

A local implementation now uses the same native artifact inspection in preview and apply. Two added directory/symlink collision scenarios pass. Broad repository verification remains unsuccessful; it is not release evidence.

## Evidence

The regression scenarios are in `packages/core/workspace-features/src/lifecycle/install/apply-realizes-the-previewed-closure.spec.ts`. A standalone collision reproduction against the changed source returns a planning-time conflict and preserves the native artifact.
