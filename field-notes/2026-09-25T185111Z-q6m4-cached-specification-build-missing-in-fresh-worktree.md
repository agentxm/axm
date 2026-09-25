---
observed_at: "2026-09-25T18:50:46Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "Nx build cache in an isolated AXM worktree"
---

# Cached specification build lacked output in a fresh worktree

## Context

The new `axm-single-owners` worktree had completed `pnpm install --frozen-lockfile`. Step 1's lint succeeded, and the hygiene target and focused test were run through Nx.

## Friction

Nx reported `specification-metadata:build` from local cache, but `tools/specification-metadata/dist` did not exist. Both `axm:verify-source-hygiene` and `axm:test --args="scripts/verify-source-hygiene.test.ts"` failed to resolve `@agentxm/specification-metadata` before their checks ran.

## Cost / impact

Two intended verification commands failed without assessing the change. A fresh package build was needed before retrying them.

## Outcome

`pnpm exec nx run specification-metadata:build --skip-nx-cache` completed successfully. The two checks had not yet been retried at capture.

## Evidence

The failed hygiene command reported `Cannot find module '@agentxm/specification-metadata'`; the focused test reported `Failed to resolve entry for package "@agentxm/specification-metadata"`. The package link existed at `node_modules/@agentxm/specification-metadata`, while its `dist` directory was absent.
