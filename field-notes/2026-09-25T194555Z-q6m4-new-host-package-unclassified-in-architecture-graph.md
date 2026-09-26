---
observed_at: "2026-09-25T19:45:55Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "AXM architecture verification"
---

# New host package was unclassified when consumers imported it

## Context

The new generic host-primitives package had passed its own checks without consumers. The next change connected its atomic-write API to four existing packages.

## Friction

The first `pnpm run verify:affected` stopped at `architecture:check` with `Unclassified source in capability graph: packages/generic/host-primitives/src/index.ts`.

## Cost / impact

One affected-verification run ended before the remaining checks. The architecture scope, file classification, and a focused test needed an additional edit and verification pass.

## Outcome

The package was classified as a generic host adapter. All 74 architecture tests passed, and `architecture:check` passed for 211 source modules. The full affected workflow still needed a passing rerun at capture.

## Evidence

`pnpm run verify:affected` exited 1 at `architecture:check` with the unclassified-source error. The subsequent `pnpm exec nx run architecture:test` and `pnpm exec nx run architecture:check` both exited 0.
