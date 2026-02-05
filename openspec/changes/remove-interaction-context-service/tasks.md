## 1. Refactor workspace-context Service

- [ ] 1.1 Change `workspace-context/service.ts` to import and use `Clack` instead of `InteractionContext`
- [ ] 1.2 Update `workspace-context` tests to use `makeClackTestLayer()` instead of `InteractionContext` mocks
- [ ] 1.3 Run `pnpm typecheck` and fix any errors
- [ ] 1.4 Run `pnpm lint` and fix any errors
- [ ] 1.5 Run `pnpm test` and fix any failures
- [ ] 1.6 Kill any vitest worker processes

## 2. Refactor init Handler

- [ ] 2.1 Update `init/handler.ts` to import and use `Clack` service instead of direct `p.*` calls
- [ ] 2.2 Remove `InteractionContext` from handler dependencies
- [ ] 2.3 Update `init/command.ts` layer wiring to provide `ClackLive` instead of `InteractionContextLive`
- [ ] 2.4 Update `init/handler.test.ts` to use `makeClackTestLayer()`
- [ ] 2.5 Run `pnpm typecheck` and fix any errors
- [ ] 2.6 Run `pnpm lint` and fix any errors
- [ ] 2.7 Run `pnpm test` and fix any failures
- [ ] 2.8 Kill any vitest worker processes

## 3. Refactor skills install Handler

- [ ] 3.1 Update `skills/install/handler.ts` to import and use `Clack` service instead of direct `p.*` calls
- [ ] 3.2 Replace `createSpinnerHelper()` usage with `Clack.spinner()`
- [ ] 3.3 Replace `promptMultiselect()` usage with `Clack.multiselect()`
- [ ] 3.4 Update layer wiring in `skills/install/command.ts` if needed
- [ ] 3.5 Update handler tests to use `makeClackTestLayer()`
- [ ] 3.6 Run `pnpm typecheck` and fix any errors
- [ ] 3.7 Run `pnpm lint` and fix any errors
- [ ] 3.8 Run `pnpm test` and fix any failures
- [ ] 3.9 Kill any vitest worker processes

## 4. Refactor skills uninstall Handler

- [ ] 4.1 Update `skills/uninstall/handler.ts` to import and use `Clack` service instead of direct `p.*` calls
- [ ] 4.2 Update layer wiring in `skills/uninstall/command.ts` if needed
- [ ] 4.3 Update handler tests to use `makeClackTestLayer()`
- [ ] 4.4 Run `pnpm typecheck` and fix any errors
- [ ] 4.5 Run `pnpm lint` and fix any errors
- [ ] 4.6 Run `pnpm test` and fix any failures
- [ ] 4.7 Kill any vitest worker processes

## 5. Delete Utility Helpers

- [ ] 5.1 Delete `packages/cli/src/utils/prompts.ts`
- [ ] 5.2 Delete `packages/cli/src/utils/prompts.test.ts`
- [ ] 5.3 Delete `packages/cli/src/utils/spinner.ts`
- [ ] 5.4 Delete `packages/cli/src/utils/spinner.test.ts`
- [ ] 5.5 Remove any remaining imports of deleted utilities
- [ ] 5.6 Run `pnpm typecheck` and fix any errors
- [ ] 5.7 Run `pnpm lint` and fix any errors
- [ ] 5.8 Run `pnpm test` and fix any failures
- [ ] 5.9 Kill any vitest worker processes

## 6. Delete InteractionContext Service

- [ ] 6.1 Delete `packages/cli/src/services/interaction-context/` directory
- [ ] 6.2 Remove InteractionContext exports from any barrel files
- [ ] 6.3 Delete `openspec/specs/cli-interaction-context/` spec directory
- [ ] 6.4 Run `pnpm typecheck` and fix any errors
- [ ] 6.5 Run `pnpm lint` and fix any errors
- [ ] 6.6 Run `pnpm test` and fix any failures
- [ ] 6.7 Kill any vitest worker processes

## 7. Final Verification

- [ ] 7.1 Run `pnpm test:e2e` and fix any failures
- [ ] 7.2 Verify no remaining references to InteractionContext in codebase
- [ ] 7.3 Verify no remaining direct `@clack/prompts` imports outside `clack-effect/`
- [ ] 7.4 Kill any vitest worker processes
