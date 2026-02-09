## 1. Workspace layer (deepest dependency — unblocks everything)

- [ ] 1.1 Migrate `workspace/display-plan.ts` from `Clack` to `Log` service — replace `clack.log.*` calls with `Log` service equivalents
- [ ] 1.2 Update `workspace/display-plan.test.ts` — replace `makeClackTestLayer` with `makeLogTestLayer`
- [ ] 1.3 Migrate `workspace/ensure-agents.ts` from `Clack` to `Log` + `Confirm` services
- [ ] 1.4 Update `workspace/ensure-agents.test.ts` — replace clack test layer with `makeLogTestLayer` + `makeConfirmTestLayer`
- [ ] 1.5 Migrate `workspace/service.ts` from `Clack` to `Log` + `Confirm` + `Select` + `Multiselect` — update `initializeProjectWorkspace`, `make`, `resolvePlan`, and exported type signatures
- [ ] 1.6 Update `workspace/service.test.ts` — replace `makeClackTestLayer`/`MockClackService` with individual TUI test layers
- [ ] 1.7 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 1.8 Run linting (`pnpm lint`), fix any errors
- [ ] 1.9 Run tests (`pnpm test`), fix any failures
- [ ] 1.10 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 1.11 Kill any vitest worker processes

## 2. Skills utilities

- [ ] 2.1 Migrate `cli-commands/skills/utils.ts` from `Clack` to `Select` service — update `selectExtensionRef`
- [ ] 2.2 Update `cli-commands/skills/utils.test.ts` — replace clack test layer with `makeSelectTestLayer` + `makeLogTestLayer`
- [ ] 2.3 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 2.4 Run linting (`pnpm lint`), fix any errors
- [ ] 2.5 Run tests (`pnpm test`), fix any failures
- [ ] 2.6 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 2.7 Kill any vitest worker processes

## 3. Install handler

- [ ] 3.1 Migrate `cli-commands/skills/install/select-skills.ts` from `Clack` to `Multiselect` service
- [ ] 3.2 Update `cli-commands/skills/install/select-skills.test.ts` — replace clack test layer with `makeMultiselectTestLayer`
- [ ] 3.3 Migrate `cli-commands/skills/install/handler.ts` from `Clack` to `Log` + `Spinner` + `Multiselect` services — replace `clack.intro`/`clack.outro` with `Log.info`/`Log.success`, adapt spinner to effectful API
- [ ] 3.4 Update `cli-commands/skills/install/handler.test.ts` — replace `makeClackTestLayer`/`MockClackConfig` with individual TUI test layers
- [ ] 3.5 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 3.6 Run linting (`pnpm lint`), fix any errors
- [ ] 3.7 Run tests (`pnpm test`), fix any failures
- [ ] 3.8 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 3.9 Kill any vitest worker processes

## 4. Uninstall handler

- [ ] 4.1 Migrate `cli-commands/skills/uninstall/handler.ts` from `Clack` to `Log` service — replace `clack.intro`/`clack.outro`/`clack.log.*` with Log equivalents
- [ ] 4.2 Update `cli-commands/skills/uninstall/handler.test.ts` — replace clack test layer with `makeLogTestLayer`
- [ ] 4.3 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 4.4 Run linting (`pnpm lint`), fix any errors
- [ ] 4.5 Run tests (`pnpm test`), fix any failures
- [ ] 4.6 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 4.7 Kill any vitest worker processes

## 5. Init handler

- [ ] 5.1 Migrate `cli-commands/init/handler.ts` from `Clack` to `Log` service
- [ ] 5.2 Update `cli-commands/init/handler.test.ts` — replace clack test layer with `makeLogTestLayer`
- [ ] 5.3 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 5.4 Run linting (`pnpm lint`), fix any errors
- [ ] 5.5 Run tests (`pnpm test`), fix any failures
- [ ] 5.6 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 5.7 Kill any vitest worker processes

## 6. Runtime and cleanup

- [ ] 6.1 Update `runtime/index.ts` — replace `ClackLive` import and `Clack` type with `TuiLive` and TUI service types in `AppLayer`
- [ ] 6.2 Remove `clack-effect/` directory entirely (service.ts, errors.ts, test.ts, index.ts)
- [ ] 6.3 Remove `@clack/prompts` from `packages/cli/package.json` and run `pnpm install`
- [ ] 6.4 Verify no remaining imports of `clack-effect` anywhere in the codebase
- [ ] 6.5 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 6.6 Run linting (`pnpm lint`), fix any errors
- [ ] 6.7 Run tests (`pnpm test`), fix any failures
- [ ] 6.8 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 6.9 Kill any vitest worker processes
