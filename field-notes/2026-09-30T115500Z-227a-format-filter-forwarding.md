---
observed_at: "2026-09-30T11:55:00Z"
session: "227a"
area: "repository format workflow"
---

# Format filter reached more files than intended

## Context

A concurrent implementation session needed formatting for ten owned settlement files while other agents edited separate files.

## Friction

`pnpm run format:affected -- --files=<comma-separated paths>` exited successfully but listed other affected files, including a concurrently edited membership specification, outside the intended filter.

## Outcome

The other owners were notified that whitespace could have changed; their substantive edits were preserved. No corrective reset or revert was performed.

## Evidence

The command output listed settlement files together with `apps/cli/src/root/agents/removes-membership-and-owned-outputs.spec.ts`, `packages/core/extension-kinds/src/subagents/manager.ts`, and other affected files.
