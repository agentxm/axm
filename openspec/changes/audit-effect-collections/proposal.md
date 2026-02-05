## Why

The codebase has established conventions for Effect collection types (documented in `/effect-collections` skill), but compliance has not been systematically verified. Inconsistent usage of array/record types in signatures reduces code clarity and type safety.

## What Changes

- Audit all TypeScript files for collection type compliance
- Replace `T[]` and `ReadonlyArray<T>` with `Array.Array<T>` in type signatures
- Replace `Record<K, V>` with `Record.ReadonlyRecord<K, V>` for readonly string-keyed objects
- Verify `Chunk` usage is limited to repeated concatenation or Stream contexts
- Verify `HashMap` usage is limited to complex keys or value-based equality needs
- Ensure Array/Record module utilities are used where appropriate (`filterMap`, `getSomes`, etc.)

## Capabilities

### New Capabilities

None — this is a refactoring task with no behavioral changes.

### Modified Capabilities

None — implementation details only, no spec-level behavior changes.

## Impact

- **Packages**: `packages/cli/src/` (all TypeScript files)
- **Type signatures**: Interfaces, function parameters, return types
- **No runtime changes**: Type aliases only, same underlying JavaScript types
- **No breaking changes**: `Array.Array<T>` === `ReadonlyArray<T>` at runtime
