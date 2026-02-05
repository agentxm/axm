## Why

The `init-*` modules in `packages/cli/src/workspace/` are dead code. Commit `53b220e` moved initialization logic into `WorkspaceContext.make()`, making these standalone modules obsolete. They are exported but never imported, adding maintenance burden and confusion.

## What Changes

- **BREAKING**: Remove `init-types.ts`, `init-state.ts`, `init-diff.ts`, `init-apply.ts` and their test files
- **BREAKING**: Remove exports of `applyInitDiff`, `computeInitDiff`, `loadActualInitState`, `buildIdealInitState`, `InitValidity`, `ActualInitState`, `IdealInitState`, `InitChange`, `InitDiff` from `packages/cli/src/workspace/index.ts`

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure removal of unused code with no behavioral changes.

## Impact

- **Code**: `packages/cli/src/workspace/init-*.ts` files removed
- **Exports**: Public exports from workspace module reduced
- **Tests**: Associated test files removed
- **Dependencies**: None - no code depends on these modules
