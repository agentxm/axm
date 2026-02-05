## No Spec Changes

This is a pure refactoring change with no behavioral modifications.

- **No new capabilities** — Only internal type annotations and utility adoption
- **No modified capabilities** — All existing behavior preserved
- **No removed capabilities** — Nothing deprecated

All changes are implementation details:

- Type signatures (`T[]` → `Array.Array<T>`) are equivalent at runtime
- Effect Array utilities produce identical results to native methods
- Unsafe index access → Option-returning alternatives don't change logic

Verification: All existing tests pass without modification.
