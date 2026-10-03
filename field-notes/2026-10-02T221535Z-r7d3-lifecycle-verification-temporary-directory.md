---
observed_at: "2026-10-02T22:15:35.483116+00:00"
session: "r7d3"
area: "local lifecycle verification"
---

# Shared temporary directory slowed native lifecycle checks

## Context

Running the declared affected gate and focused source-install specifications in an isolated worktree.

## Friction

The kernel gate reported 51 failures, including repeated five-second native lifecycle timeouts. A single-worker selection run with a 30-second diagnostic timeout still failed six cases; its new exact-path case passed in 23.9 seconds. A runtime sample showed directory enumeration, and the shared temporary directory contained 7,484 entries. Native path spelling checks enumerate ancestor directories.

## Outcome

The same exact-path case passed with the normal timeout after directing temporary fixtures into a dedicated directory through TMPDIR. No shared temporary files were deleted. Complete verification with that environment remains pending.

## Evidence

`pnpm run verify:affected`; `pnpm exec nx run workspace-features:test --args=...`; `packages/core/workspace-kernel/src/locations/native-address.ts` (`existingNativeSpelling`).
