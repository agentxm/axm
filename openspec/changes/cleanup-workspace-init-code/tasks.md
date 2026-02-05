## 1. Remove Init Files

- [ ] 1.1 Delete `packages/cli/src/workspace/init-types.ts`
- [ ] 1.2 Delete `packages/cli/src/workspace/init-types.test.ts`
- [ ] 1.3 Delete `packages/cli/src/workspace/init-state.ts`
- [ ] 1.4 Delete `packages/cli/src/workspace/init-state.test.ts`
- [ ] 1.5 Delete `packages/cli/src/workspace/init-diff.ts`
- [ ] 1.6 Delete `packages/cli/src/workspace/init-diff.test.ts`
- [ ] 1.7 Delete `packages/cli/src/workspace/init-apply.ts`
- [ ] 1.8 Delete `packages/cli/src/workspace/init-apply.test.ts`

## 2. Update Exports

- [ ] 2.1 Remove init-\* exports from `packages/cli/src/workspace/index.ts`

## 3. Verification

- [ ] 3.1 Run `pnpm typecheck` and fix any errors
- [ ] 3.2 Run `pnpm lint` and fix any errors
- [ ] 3.3 Run `pnpm test` and fix any failures
- [ ] 3.4 Run `pnpm test:e2e` and fix any failures
- [ ] 3.5 Kill any vitest worker processes
