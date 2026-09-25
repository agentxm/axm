---
observed_at: "2026-09-25T19:52:08Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "AXM capability dependency verification"
---

# Self-update adapters could not use the shared host entry point

## Context

The self-update native adapters switched their atomic file writes to the generic host-primitives package.

## Friction

After the Nx role boundary was adjusted, the next `pnpm run verify:affected` stopped at `cli-maintenance:lint`. The capability dependency rule rejected two imports of the host package's public entry point.

## Cost / impact

A third affected-verification run ended early. The capability policy and a public-versus-private import test needed an additional edit and focused test run.

## Outcome

The policy now allows adapter, composition, and test files to import only the host-primitives public entry point. All 75 architecture tests passed. The full affected workflow still needed a passing rerun at capture.

## Evidence

`pnpm run verify:affected` failed with `boundaries/dependencies` at two self-update adapter imports. `pnpm exec nx run architecture:test` exited 0 with 75 tests passing.
