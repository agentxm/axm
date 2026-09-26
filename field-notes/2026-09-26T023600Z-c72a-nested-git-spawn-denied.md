---
observed_at: "2026-09-26T02:36:00Z"
session: "c72a"
area: "Nx and Vitest verification in the isolated worktree"
---

# Nested subprocesses were denied during AXM verification

## Context

The MCP source-identity change built and typechecked in the writable `/tmp` worktree. Focused tests and the affected verification workflow were the next checks.

## Friction

Nx showed a test failure without the underlying Vitest output. Capturing that output showed the specification evidence reporter failed with `spawnSync git EPERM`. Four install-operation tests also failed at `spawnSync /bin/sh EPERM`. `pnpm run verify:affected` stopped at `NX spawnSync git EPERM` after architecture and unused-code checks passed.

## Cost / impact

The normal test reporter could not produce specification receipts, and affected verification could not complete. Diagnosis required rerunning targeted checks with captured output.

## Outcome

Focused source-identity, MCP lifecycle, sync, authoring, and CLI rendering tests passed with Vitest's default reporter, including the relevant secret-identity cases. The four shell-dependent install-operation cases remained unverified locally.

## Evidence

`workspace:build`, `workspace:typecheck`, and `cli:typecheck` passed. The captured Vitest result for the six-file MCP set was 44 passed and 4 failed, each failure reporting `spawnSync /bin/sh EPERM`.
