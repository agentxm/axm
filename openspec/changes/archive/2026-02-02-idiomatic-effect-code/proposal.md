## Why

The codebase mixes imperative patterns (mutable arrays, for loops, sequential processing) with Effect code. This creates inconsistency, misses parallelization opportunities, and makes the code harder to reason about. Adopting idiomatic Effect patterns improves readability, enables automatic parallelization, and aligns with the project's Effect-first values.

## What Changes

- Replace mutable array accumulation (`let results = []; results.push(...)`) with functional Effect composition
- Replace for-of loops inside Effect.gen with `Effect.forEach` and `Effect.all`
- Replace index-based for loops with `Effect.forEach` preserving index access via tuple pattern
- Enable parallelization where sequential processing isn't required (e.g., lock updates, settings updates)
- Standardize on declarative pipelines over step-by-step mutation

## Capabilities

### New Capabilities

_None - this is a refactoring change with no new user-facing capabilities._

### Modified Capabilities

_None - behavior remains identical, only implementation patterns change._

## Impact

**Files requiring changes:**

| File                                                                       | Issue                                 | Priority |
| -------------------------------------------------------------------------- | ------------------------------------- | -------- |
| `packages/core/src/experimental/skills/skill-discovery.ts:63-86`           | Mutable `.push()` in for-of           | Medium   |
| `packages/core/src/experimental/skills/content-hash.ts:60-87`              | Mutable `.push()` in for-of           | Medium   |
| `packages/core/src/experimental/resolution/resolvers/local-path.ts:88-115` | Mutable `.push()` with filtering      | Medium   |
| `packages/core/src/experimental/skills/wellknown.ts:176-229`               | Index-based for loops                 | Medium   |
| `packages/cli/src/commands/skills/install/handler.ts:279-315`              | Sequential ops that could parallelize | High     |
| `packages/cli/src/commands/skills/install/handler.ts:420-456`              | Sequential ops that could parallelize | High     |

**No breaking changes** - all refactoring is internal implementation only. Tests should continue to pass without modification.
