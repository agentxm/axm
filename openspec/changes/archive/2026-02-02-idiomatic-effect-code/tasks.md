## 1. Baseline Verification

- [x] 1.1 Run full test suite to establish green baseline
- [x] 1.2 Kill any runaway vitest worker processes

## 2. Refactor skill-discovery.ts

- [x] 2.1 Refactor `walkDirectory` to use `Effect.forEach` + `Array.flat()` instead of mutable array with push
- [x] 2.2 Run typecheck and tests to verify no regressions
- [x] 2.3 Kill any runaway vitest worker processes

## 3. Refactor content-hash.ts

- [x] 3.1 Refactor `walk` function to use `Effect.forEach` + `Array.flat()` instead of mutable array with push
- [x] 3.2 Run typecheck and tests to verify no regressions
- [x] 3.3 Kill any runaway vitest worker processes

## 4. Refactor local-path.ts

- [x] 4.1 Refactor `scanDirectory` to use `Effect.forEach` with `Option` pattern instead of mutable array with conditional push
- [x] 4.2 Run typecheck and tests to verify no regressions
- [x] 4.3 Kill any runaway vitest worker processes

## 5. Refactor wellknown.ts

- [x] 5.1 Refactor validation loops to use `Effect.forEach` with indexed entries instead of index-based for loops
- [x] 5.2 Run typecheck and tests to verify no regressions
- [x] 5.3 Kill any runaway vitest worker processes

## 6. Refactor install handler.ts

- [x] 6.1 Refactor sequential lock/settings updates (lines 279-315) to use parallel `Effect.forEach` with `Effect.all`
- [x] 6.2 Refactor sequential lock/settings updates (lines 420-456) to use parallel `Effect.forEach` with `Effect.all`
- [x] 6.3 Run typecheck and tests to verify no regressions
- [x] 6.4 Kill any runaway vitest worker processes

## 7. Final Verification

- [x] 7.1 Run full test suite to confirm all refactoring complete
- [x] 7.2 Run typecheck to confirm no type errors
- [x] 7.3 Kill any runaway vitest worker processes
