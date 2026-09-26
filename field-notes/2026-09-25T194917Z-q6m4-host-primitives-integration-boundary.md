---
observed_at: "2026-09-25T19:49:17Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "AXM module-boundary verification"
---

# Generic host primitives failed the integration role boundary

## Context

The shared host-primitives package owns atomic writes used by the supporting registry client, which has the integration role.

## Friction

After the architecture gate passed, `pnpm run verify:affected` stopped at `registry-client:lint`. Nx rejected imports from `registry-client` into `host-primitives` because integrations could not depend on capability-role packages.

## Cost / impact

A second affected-verification run ended early. The role constraint and its focused regression coverage needed an additional edit and verification pass.

## Outcome

The integration role now permits the exact `scope:host-primitives` target while still rejecting other capability imports. All 20 focused source-boundary tests passed. The full affected workflow still needed a passing rerun at capture.

## Evidence

`pnpm run verify:affected` failed with `@nx/enforce-module-boundaries` at two registry-client imports. `pnpm exec nx run axm:test --args='scripts/source-boundary-lint.test.ts'` exited 0 with 20 tests passing.
