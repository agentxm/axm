## 1. Refactor workspace-context Service

- [x] 1.1 Change `workspace-context/service.ts` to import and use `Clack` instead of `InteractionContext`
- [x] 1.2 Update `workspace-context` tests to use `makeClackTestLayer()` instead of `InteractionContext` mocks
- [x] 1.3 Run `pnpm typecheck` and fix any errors
- [x] 1.4 Run `pnpm lint` and fix any errors
- [x] 1.5 Run `pnpm test` and fix any failures
- [x] 1.6 Kill any vitest worker processes

## 2. Refactor init Handler

- [x] 2.1 Update `init/handler.ts` to import and use `Clack` service instead of direct `p.*` calls
- [x] 2.2 Remove `InteractionContext` from handler dependencies
- [x] 2.3 Update `init/command.ts` layer wiring to provide `ClackLive` instead of `InteractionContextLive`
- [x] 2.4 Update `init/handler.test.ts` to use `makeClackTestLayer()`
- [x] 2.5 Run `pnpm typecheck` and fix any errors
- [x] 2.6 Run `pnpm lint` and fix any errors
- [x] 2.7 Run `pnpm test` and fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Refactor skills install Handler

- [x] 3.1 Update `skills/install/handler.ts` to import and use `Clack` service instead of direct `p.*` calls
- [x] 3.2 Replace `createSpinnerHelper()` usage with `Clack.spinner()`
- [x] 3.3 Replace `promptMultiselect()` usage with `Clack.multiselect()`
- [x] 3.4 Update layer wiring in `skills/install/command.ts` if needed
- [x] 3.5 Update handler tests to use `makeClackTestLayer()`
- [x] 3.6 Run `pnpm typecheck` and fix any errors
- [x] 3.7 Run `pnpm lint` and fix any errors
- [x] 3.8 Run `pnpm test` and fix any failures
- [x] 3.9 Kill any vitest worker processes

## 4. Refactor skills uninstall Handler

- [x] 4.1 Update `skills/uninstall/handler.ts` to import and use `Clack` service instead of direct `p.*` calls
- [x] 4.2 Update layer wiring in `skills/uninstall/command.ts` if needed
- [x] 4.3 Update handler tests to use `makeClackTestLayer()`
- [x] 4.4 Run `pnpm typecheck` and fix any errors
- [x] 4.5 Run `pnpm lint` and fix any errors
- [x] 4.6 Run `pnpm test` and fix any failures
- [x] 4.7 Kill any vitest worker processes

## 5. Delete Utility Helpers

- [x] 5.1 Delete `packages/cli/src/utils/prompts.ts`
- [x] 5.2 Delete `packages/cli/src/utils/prompts.test.ts`
- [x] 5.3 Delete `packages/cli/src/utils/spinner.ts`
- [x] 5.4 Delete `packages/cli/src/utils/spinner.test.ts`
- [x] 5.5 Remove any remaining imports of deleted utilities
- [x] 5.6 Run `pnpm typecheck` and fix any errors
- [x] 5.7 Run `pnpm lint` and fix any errors
- [x] 5.8 Run `pnpm test` and fix any failures
- [x] 5.9 Kill any vitest worker processes

## 6. Delete InteractionContext Service

- [x] 6.1 Delete `packages/cli/src/services/interaction-context/` directory
- [x] 6.2 Remove InteractionContext exports from any barrel files
- [x] 6.3 Delete `openspec/specs/cli-interaction-context/` spec directory
- [x] 6.4 Run `pnpm typecheck` and fix any errors
- [x] 6.5 Run `pnpm lint` and fix any errors
- [x] 6.6 Run `pnpm test` and fix any failures
- [x] 6.7 Kill any vitest worker processes

## 7. Final Verification

- [x] 7.1 Run `pnpm test:e2e` and fix any failures
- [x] 7.2 Verify no remaining references to InteractionContext in codebase
- [x] 7.3 Verify no remaining direct `@clack/prompts` imports outside `clack-effect/`
- [x] 7.4 Kill any vitest worker processes
