---
observed_at: "2026-10-05T22:47:32.276303+00:00"
session: "c41b7d2e"
area: "Nx build cache in isolated worktrees"
---

# Missing build output after a cached dependency build

## Context

Running the CLI typecheck target in a newly installed isolated worktree.

## Friction

The target could not resolve host-primitives built exports after Nx reported its dependency build cached.

## Cost / impact

An additional uncached dependency build and typecheck retry were required.

## Outcome

Running `pnpm exec nx run host-primitives:build --skip-nx-cache` restored the output and let typechecking proceed to source diagnostics.
