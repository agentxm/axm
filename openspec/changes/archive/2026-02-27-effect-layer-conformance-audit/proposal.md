## Why

We recently codified Effect service and layer best practices in the `effect-service` and `effect-layers` skills. The codebase predates these guidelines — a comprehensive audit reveals systematic non-conformance in service tag naming, interface patterns, test layer organization, and dependency capture. Remediating now prevents the gap from widening as new services are added.

## What Changes

- Namespace all service tag identifiers to `@axm.sh/cli/<Name>` (12 tags currently use unqualified names)
- Convert 11 services with separate explicit interfaces to the combined tag + inline interface pattern (no service has multiple implementations)
- Replace `[Layer, Mock]` tuple test layer factories with `*Test` named layers using `Ref`-based state
- Rename 6 test layer files from `src/clack-effect/*/test.ts` to co-located `*Test.ts` files
- Type the `provide` helper in captured-dependency layers to eliminate 4 `any` casts
- Prefer closing over yielded service values directly where the captured-dependency re-provision pattern is unnecessary

## Capabilities

### New Capabilities

_(none — this is a conformance remediation, not new functionality)_

### Modified Capabilities

_(no spec-level behavior changes — all changes are internal implementation alignment)_

## Impact

- **25 service definitions** across `packages/cli/src/` — tag identifiers and interface patterns
- **14 Layer.effect live layers** — dependency capture approach review
- **6 test layer factory files** in `src/clack-effect/*/test.ts` — rename + pattern change
- **~46 test files** consuming test layer factories — import and usage updates
- **4 files** with `any` type casts in `provide` helpers — type safety improvement
- **Zero behavioral changes** — all modifications are structural/organizational
