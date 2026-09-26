---
observed_at: "2026-09-26T05:58:53Z"
session: "c72a"
area: "pnpm install in isolated AXM worktree"
---

# Install could not complete in the isolated worktree

## Context

The protected-state work package added workspace dependencies, requiring an updated lockfile and install before Nx validation.

## Friction

`pnpm install --offline` stopped on an uncached `@babel/preset-modules` tarball. A filtered offline install stopped on missing `@effect/tsgo` metadata. `pnpm install --frozen-lockfile` then reported DNS failures fetching npm tarballs and was stopped. The incomplete install had removed root `node_modules` links in the worktree.

## Cost / impact

Nx commands were temporarily unavailable, and dependency freshness checks rejected the worktree. A clean full install remains unverified.

## Outcome

`pnpm install --lockfile-only --offline` updated the lockfile. Ignored package links were restored from the existing AXM checkout, with local `@agentxm` links resolving to the isolated worktree. Nx validation resumed with `pnpm_config_verify_deps_before_run=warn` on each command.

## Evidence

Observed install errors named `@babel/preset-modules`, `@effect/tsgo`, and npm DNS resolution; the worktree's dependency freshness check reported out-of-sync dependencies.
