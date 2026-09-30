---
observed_at: "2026-09-30T11:21:38.297693+00:00"
session: "d49b"
area: "Nx shared-worktree builds"
---

# Concurrent targets interrupted dependency output availability

## Context

Two agents ran narrow targets in the same worktree: workspace-kernel:typecheck and workspace-features:test. Both targets build shared dependencies.

## Friction

The feature target reported TS2307 missing workspace-kernel public modules during extension-kinds compilation immediately after its log reported a successful kernel build. Another agent confirmed its overlapping kernel typecheck. Coordination identified shared clean build outputs as likely interference; exact timing was not independently measured.

## Cost / impact

The feature tests did not execute and needed a retry.

## Outcome

Agents handed off exclusive target execution and paused other builds. The serialized retry reached feature compilation and exposed a schema typing error, corrected before another retry.

## Evidence

`pnpm exec nx run workspace-features:test -- src/authoring/create/skills/preview-is-pure.spec.ts src/authoring/create/skills/scaffolds-for-every-configured-agent.spec.ts` reported missing `@agentxm/workspace-kernel/operations`, `materialization`, and other public modules.
