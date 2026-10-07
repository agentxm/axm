---
observed_at: "2026-10-07T20:40:49Z"
session: "ec304b"
area: "pnpm offline installation in staged commit verification"
---

# Offline commit verification needed missing dependency snapshots

## Context

Committing a staged CLI change through the normal hook, which typechecks a
disposable index worktree after a frozen offline dependency installation.

## Friction

The offline installation failed with `ERR_PNPM_NO_OFFLINE_TARBALL` for
`unrs-resolver@1.12.2`. It also reported an unavailable optional
`esbuild@0.27.2` snapshot. The active worktree's dependency installation had
already succeeded, but that did not establish offline readiness for another
worktree.

## Cost / impact

One commit attempt stopped after earlier staged checks passed. Recovery needed
a separate dependency worktree, an online frozen install, a lockfile fetch, and
an offline install check. The active test installation was kept available while
those operations ran.

## Outcome

The separate worktree's frozen offline install passed after the online install
and `pnpm fetch`. The normal commit hook still needs its retry; offline install
success alone is not complete commit verification.

## Evidence

- Hook output: `ERR_PNPM_NO_OFFLINE_TARBALL`, required
  `unrs-resolver@1.12.2` snapshot absent in the local store.
- Tool version: pnpm 12.9.1.
- The dependency seed used the existing lockfile and subsequently completed
  `pnpm install --offline --frozen-lockfile`.
