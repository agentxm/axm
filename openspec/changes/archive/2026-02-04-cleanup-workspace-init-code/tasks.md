## 1. Remove Init Files

- [x] 1.1 Delete `packages/cli/src/workspace/init-types.ts`
- [x] 1.2 Delete `packages/cli/src/workspace/init-types.test.ts`
- [x] 1.3 Delete `packages/cli/src/workspace/init-state.ts`
- [x] 1.4 Delete `packages/cli/src/workspace/init-state.test.ts`
- [x] 1.5 Delete `packages/cli/src/workspace/init-diff.ts`
- [x] 1.6 Delete `packages/cli/src/workspace/init-diff.test.ts`
- [x] 1.7 Delete `packages/cli/src/workspace/init-apply.ts`
- [x] 1.8 Delete `packages/cli/src/workspace/init-apply.test.ts`

## 2. Update Exports

- [x] 2.1 Remove init-\* exports from `packages/cli/src/workspace/index.ts`

## 3. Verification

- [x] 3.1 Run `pnpm typecheck` and fix any errors
- [x] 3.2 Run `pnpm lint` and fix any errors
- [x] 3.3 Run `pnpm test` and fix any failures
- [x] 3.4 Run `pnpm test:e2e` and fix any failures
- [x] 3.5 Kill any vitest worker processes
