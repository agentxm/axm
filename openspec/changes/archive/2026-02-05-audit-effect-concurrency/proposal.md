## Why

The `/effect-concurrency` skill establishes concurrency best practices, but the codebase has a few patterns that don't align. Specifically, some `Effect.forEach` calls use `"inherit"` concurrency for independent network operations, and some `Effect.all` calls with small independent operations could be more explicit about concurrency.

## What Changes

- Fix `Effect.forEach` in `ideal-state.ts` to use `"unbounded"` instead of `"inherit"` for independent network requests
- Add explicit `{ concurrency: "unbounded" }` to `Effect.all` calls with 2+ independent I/O operations
- Add concurrency option to validation forEach in `wellknown.ts`

## Capabilities

### New Capabilities

None - this is a code quality alignment, not a feature change.

### Modified Capabilities

None - no spec-level behavior changes, only implementation alignment with concurrency best practices.

## Impact

**Files affected:**

- `packages/cli/src/workspace/ideal-state.ts` - Change `"inherit"` to `"unbounded"` for version fetching
- `packages/cli/src/workspace/load-state.ts` - Add explicit concurrency to `Effect.all` calls
- `packages/cli/src/extensions/skills/wellknown.ts` - Add concurrency to validation forEach
- `packages/cli/src/agents/codex/detection.ts` - Add explicit concurrency to `Effect.all`

**Risk:** Low - these changes improve performance by parallelizing independent operations. No behavioral changes.
