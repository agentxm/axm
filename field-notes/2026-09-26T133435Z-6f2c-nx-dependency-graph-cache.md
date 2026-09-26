---
observed_at: "2026-09-26T13:34:35Z"
session: "6f2c"
area: "local Nx verification"
---

# Stale Nx graph reported a used dependency as unused

## Context

The release worktree ran `pnpm run verify:affected` after the publication source change.

## Friction

`registry-client:lint` reported `@agentxm/registry-protocol` as unused although registry-client source imports it. A narrow rerun reproduced the error. A direct attempt to remove the generated Nx workspace data was rejected by automatic command review.

## Cost / impact

The affected run stopped after 47.4s; the narrow lint rerun also failed and verification had to be repeated.

## Outcome

`pnpm exec nx reset` succeeded, and `registry-client:lint` passed on the next run. Broader verification was rerunning at capture time.

## Evidence

`packages/supporting/registry-client/package.json:42`; `packages/supporting/registry-client/src/client.ts` imports registry-protocol; local Nx lint output before and after reset.
