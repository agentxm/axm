## 1. Baseline Verification

- [ ] 1.1 Run full test suite to establish green baseline
- [ ] 1.2 Kill any runaway vitest worker processes

## 2. Refactor skill-discovery.ts

- [ ] 2.1 Refactor `walkDirectory` to use `Effect.forEach` + `Array.flat()` instead of mutable array with push
- [ ] 2.2 Run typecheck and tests to verify no regressions
- [ ] 2.3 Kill any runaway vitest worker processes

## 3. Refactor content-hash.ts

- [ ] 3.1 Refactor `walk` function to use `Effect.forEach` + `Array.flat()` instead of mutable array with push
- [ ] 3.2 Run typecheck and tests to verify no regressions
- [ ] 3.3 Kill any runaway vitest worker processes

## 4. Refactor local-path.ts

- [ ] 4.1 Refactor `scanDirectory` to use `Effect.forEach` with `Option` pattern instead of mutable array with conditional push
- [ ] 4.2 Run typecheck and tests to verify no regressions
- [ ] 4.3 Kill any runaway vitest worker processes

## 5. Refactor wellknown.ts

- [ ] 5.1 Refactor validation loops to use `Effect.forEach` with indexed entries instead of index-based for loops
- [ ] 5.2 Run typecheck and tests to verify no regressions
- [ ] 5.3 Kill any runaway vitest worker processes

## 6. Refactor install handler.ts

- [ ] 6.1 Refactor sequential lock/settings updates (lines 279-315) to use parallel `Effect.forEach` with `Effect.all`
- [ ] 6.2 Refactor sequential lock/settings updates (lines 420-456) to use parallel `Effect.forEach` with `Effect.all`
- [ ] 6.3 Run typecheck and tests to verify no regressions
- [ ] 6.4 Kill any runaway vitest worker processes

## 7. Final Verification

- [ ] 7.1 Run full test suite to confirm all refactoring complete
- [ ] 7.2 Run typecheck to confirm no type errors
- [ ] 7.3 Kill any runaway vitest worker processes
