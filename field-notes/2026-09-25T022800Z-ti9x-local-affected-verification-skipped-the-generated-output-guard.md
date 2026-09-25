---
observed_at: "2026-09-25T02:26:00Z"
session: "ti9x"
area: "instruction: AGENTS.md pre-merge workflow vs CI verify:clean"
---

# Local affected verification passed while CI failed on generated-output drift

## Context

Delivering the typed-identity change: five `*.spec.ts` files were revised and
`pnpm run verify:affected`, the pre-merge workflow AGENTS.md names, passed on
the merged branch before the pull request was opened with auto-merge.

## Friction

CI's "Verify proposed change" job runs `pnpm run verify:clean` before
`verify:affected`; its `generate:check` step failed with `Generated output
drift detected in Nx-owned outputs: M specifications/catalog.md`. The local
workflow does not include that guard, so the drift from the spec revisions
surfaced only on the remote run.

## Cost / impact

One failed CI run (about 8 minutes of queue and run time), one
regenerate-commit-push cycle, and re-arming auto-merge.

## Outcome

`pnpm generate` regenerated `specifications/catalog.md`; the change was
committed, pushed, and auto-merge re-enabled.

## Evidence

GitHub Actions run 36084046511 on agentxm/axm pull request #448, job "Verify
proposed change", step "Verify affected changes"; `package.json` scripts
`verify:clean` and `generate:check`.
