## Why

The codebase uses unsafe array index access (`array[n]`) in a few places instead of Effect's `Array.get()` or `Array.head()`, which return `Option<T>` for type-safe handling of potentially missing elements. This creates inconsistency with our established Effect collection patterns.

## What Changes

- Replace unsafe index access `parts[2]` with `Array.get(parts, 2)` in git.ts
- Replace unsafe index access `items[result]` with `Array.get(items, result)` in clack-effect service
- Replace `items[index]` with `Array.get(items, index)` in clack-effect multiselect
- Replace unsafe index access `v.issues[0]` with `Array.head(v.issues)` in state/types.ts

## Capabilities

### New Capabilities

None - this is a refactoring change with no new capabilities.

### Modified Capabilities

None - no spec-level behavior changes, only implementation alignment.

## Impact

- `packages/cli/src/extensions/skills/git.ts` - ls-tree parsing
- `packages/cli/src/clack-effect/service.ts` - select and multiselect prompts
- `packages/cli/src/extensions/skills/state/types.ts` - validity code extraction
