## Why

The codebase uses inconsistent array type patterns (`readonly T[]`, `ReadonlyArray<T>`) instead of Effect's `Array.Array<T>` in type signatures. Additionally, native array method chains (`.map().filter().map()`) are used where Effect's `Array.filterMap` and `Array.findFirst` would be more idiomatic and efficient.

## What Changes

- **Standardize array types in signatures** — Replace `readonly T[]` and `ReadonlyArray<T>` with `Array.Array<T>` in interfaces, type aliases, and function signatures
- **Adopt Effect Array utilities** — Replace `.map().filter().map()` chains with `Array.filterMap`, `.find()` with `Array.findFirst`
- **No changes to Chunk/HashMap** — Current absence is correct (no use cases requiring them)
- **No changes to Record types** — Already correctly using `Record.ReadonlyRecord<string, T>`

## Capabilities

### New Capabilities

None — this is a refactoring change to align existing code with conventions.

### Modified Capabilities

None — no spec-level behavior changes, only implementation alignment.

## Impact

**Files requiring array type updates (25+ type signatures):**

- `extensions/skills/state/types.ts` — Primary file, 25+ array type signatures
- `resolution/types.ts` — 4 signatures
- `workspace/ideal-state.ts` — 5 signatures
- `workspace/apply.ts` — 7+ signatures
- `workspace/load-state.ts` — 4 signatures
- `clack-effect/service.ts` — 5 signatures
- `cli-commands/skills/install/handler.ts` — 6 signatures
- `cli-commands/skills/uninstall/handler.ts` — 1 signature
- `cli-commands/init/handler.ts` — 1 signature

**Files requiring Array utility adoption:**

- `cli-commands/skills/install/handler.ts` — 3 `.map().filter().map()` chains
- `cli-commands/skills/uninstall/handler.ts` — 2 `.map().filter().map()` chains
- `clack-effect/service.ts` — 2 chains + 1 `.find()`
- `clack-effect/test.ts` — 1 chain
- `workspace/apply.ts` — 2 `.find()` usages

**No breaking changes** — All modifications are internal type annotations and implementation details.
