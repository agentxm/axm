## 1. Update OperationContext

- [ ] 1.1 Remove `interaction` field from `OperationContextConfig` in `packages/cli/src/services/operation-context/`
- [ ] 1.2 Remove `interaction` from `OperationContext.layer()` and `OperationContext.defaultLayer`
- [ ] 1.3 Update any tests that reference `interaction` field
- [ ] 1.4 Run `pnpm typecheck` and fix any errors
- [ ] 1.5 Run `pnpm lint` and fix any errors
- [ ] 1.6 Run `pnpm test` and fix any failures
- [ ] 1.7 Kill any vitest worker processes

## 2. Refactor workspace-context Service

- [ ] 2.1 Change `workspace-context/service.ts` to import and use `Clack` instead of `InteractionContext`
- [ ] 2.2 Update `workspace-context` tests to use `makeClackTestLayer()` instead of `InteractionContext` mocks
- [ ] 2.3 Run `pnpm typecheck` and fix any errors
- [ ] 2.4 Run `pnpm lint` and fix any errors
- [ ] 2.5 Run `pnpm test` and fix any failures
- [ ] 2.6 Kill any vitest worker processes

## 3. Refactor init Handler

- [ ] 3.1 Update `init/handler.ts` to import and use `Clack` service instead of direct `p.*` calls
- [ ] 3.2 Remove `InteractionContext` from handler dependencies
- [ ] 3.3 Update `init/command.ts` layer wiring to provide `ClackLive` instead of `InteractionContextLive`
- [ ] 3.4 Update `init/handler.test.ts` to use `makeClackTestLayer()`
- [ ] 3.5 Run `pnpm typecheck` and fix any errors
- [ ] 3.6 Run `pnpm lint` and fix any errors
- [ ] 3.7 Run `pnpm test` and fix any failures
- [ ] 3.8 Kill any vitest worker processes

## 4. Refactor skills install Handler

- [ ] 4.1 Update `skills/install/handler.ts` to import and use `Clack` service instead of direct `p.*` calls
- [ ] 4.2 Replace `createSpinnerHelper()` usage with `Clack.spinner()`
- [ ] 4.3 Replace `promptMultiselect()` usage with `Clack.multiselect()`
- [ ] 4.4 Update layer wiring in `skills/install/command.ts` if needed
- [ ] 4.5 Update handler tests to use `makeClackTestLayer()`
- [ ] 4.6 Run `pnpm typecheck` and fix any errors
- [ ] 4.7 Run `pnpm lint` and fix any errors
- [ ] 4.8 Run `pnpm test` and fix any failures
- [ ] 4.9 Kill any vitest worker processes

## 5. Refactor skills uninstall Handler

- [ ] 5.1 Update `skills/uninstall/handler.ts` to import and use `Clack` service instead of direct `p.*` calls
- [ ] 5.2 Update layer wiring in `skills/uninstall/command.ts` if needed
- [ ] 5.3 Update handler tests to use `makeClackTestLayer()`
- [ ] 5.4 Run `pnpm typecheck` and fix any errors
- [ ] 5.5 Run `pnpm lint` and fix any errors
- [ ] 5.6 Run `pnpm test` and fix any failures
- [ ] 5.7 Kill any vitest worker processes

## 6. Delete Utility Helpers

- [ ] 6.1 Delete `packages/cli/src/utils/prompts.ts`
- [ ] 6.2 Delete `packages/cli/src/utils/prompts.test.ts`
- [ ] 6.3 Delete `packages/cli/src/utils/spinner.ts`
- [ ] 6.4 Delete `packages/cli/src/utils/spinner.test.ts`
- [ ] 6.5 Remove any remaining imports of deleted utilities
- [ ] 6.6 Run `pnpm typecheck` and fix any errors
- [ ] 6.7 Run `pnpm lint` and fix any errors
- [ ] 6.8 Run `pnpm test` and fix any failures
- [ ] 6.9 Kill any vitest worker processes

## 7. Delete InteractionContext Service

- [ ] 7.1 Delete `packages/cli/src/services/interaction-context/` directory
- [ ] 7.2 Remove InteractionContext exports from any barrel files
- [ ] 7.3 Delete `openspec/specs/cli-interaction-context/` spec directory
- [ ] 7.4 Run `pnpm typecheck` and fix any errors
- [ ] 7.5 Run `pnpm lint` and fix any errors
- [ ] 7.6 Run `pnpm test` and fix any failures
- [ ] 7.7 Kill any vitest worker processes

## 8. Final Verification

- [ ] 8.1 Run `pnpm test:e2e` and fix any failures
- [ ] 8.2 Verify no remaining references to InteractionContext in codebase
- [ ] 8.3 Verify no remaining direct `@clack/prompts` imports outside `clack-effect/`
- [ ] 8.4 Kill any vitest worker processes
