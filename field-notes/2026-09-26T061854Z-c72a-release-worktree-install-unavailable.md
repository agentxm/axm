---
observed_at: "2026-09-26T06:18:54Z"
session: "c72a"
area: "pnpm install in AXM release worktree"
---

# Offline install removed release-worktree links before failing

## Context

The public AXM repository instructions require an explicit install before repository commands. A separate worktree was created for the release and CI gate changes.

## Friction

`pnpm install --offline --frozen-lockfile` stopped because the local store lacked `@babel/plugin-transform-property-literals@7.27.1`. The incomplete attempt removed root `node_modules` package links, including Nx.

## Cost / impact

The release worktree could not run repository targets until its ignored links were restored. A clean install remains unverified.

## Outcome

Existing dependency links were copied from the product worktree without overwriting the remaining cache directories. The release worktree's `@agentxm/extension-model` link resolves locally and its Nx link resolves to the existing AXM checkout.

## Evidence

The install reported `ERR_PNPM_NO_OFFLINE_TARBALL` for `@babel/plugin-transform-property-literals`; the subsequent `ls` showed `node_modules/nx` and `node_modules/@agentxm/extension-model` absent before restoration.
