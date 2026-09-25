---
observed_at: "2026-09-25T14:30:00Z"
session: "c91e"
area: "local verification: Nx typecheck cache"
---

# A cache-hit typecheck reported hundreds of missing-module errors for built dependencies

## Context

Iterating on `packages/core/workspace` in a fresh worktree of `axm` and
running `pnpm exec nx run workspace:typecheck` after each batch of edits.

## Friction

The first run reported 4 real errors. The second run, with no dependency
changes, reported 327 errors, almost all `TS2307: Cannot find module
'@agentxm/extension-model/...'` and `'@agentxm/registry-client'`, plus
follow-on `unknown` types. Nx reported `Cache: 16/17 hit`; the dependency
`dist` directories referenced by the project references were absent on disk.

## Cost / impact

One wasted typecheck run and one investigation of the tsconfig references
before the cause was suspected; a third run with `--skip-nx-cache` rebuilt
the dependencies and reported the real errors again.

## Outcome

`pnpm exec nx run workspace:typecheck --skip-nx-cache` restored the
dependency outputs; later cached runs in the same worktree were correct.

## Evidence

- Second run: `COUNT 327` errors, first lines
  `packages/core/workspace/src/acquisition/acquired-content.ts:6 TS2307 Cannot find module '@agentxm/extension-model/unstable/extensions/refs/extension-ref'`.
- `ls packages/core/extension-model/dist` printed nothing between the runs.
- Third run with `--skip-nx-cache`: 8 errors, all in files the task had edited.
