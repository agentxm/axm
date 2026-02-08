## 1. Remove unnecessary re-exports

- [x] 1.1 Remove backwards-compat re-exports of `LOCKFILE_NAME` and `SETTINGS_FILENAME` from `paths.ts`
- [x] 1.2 Remove type re-exports (`JobStep`, `JobStepResult`, `OperationResult`, `PlannedJobStep`) from `apply-plan.ts`; update any imports that relied on the `apply-plan` path to import from the barrel or `plan.ts`
- [x] 1.3 Run `pnpm typecheck` and fix any errors
- [x] 1.4 Run `pnpm lint` and fix any errors
- [x] 1.5 Run `pnpm test` and fix any failures
- [x] 1.6 Run `pnpm test:e2e` and fix any failures
- [x] 1.7 Kill any vitest worker processes

## 2. Make path functions effectful

- [x] 2.1 Update `paths.test.ts`: convert tests to `@effect/vitest` with `it.effect`, provide `Path` layer, adjust assertions for effectful signatures
- [x] 2.2 Refactor `paths.ts`: replace `node:path` with `@effect/platform` `Path.Path` service; wrap `os.homedir()` in `Effect.sync`; change `getGlobalDir`, `getProjectDir`, `getAxmDir` to return `Effect.Effect<string, never, Path.Path>`
- [x] 2.3 Remove the `node:path` import from `paths.ts`
- [x] 2.4 Update `service.ts` call site: `yield*` the `getAxmDir` calls in `make()`
- [x] 2.5 Update barrel `index.ts` if needed
- [x] 2.6 Run `pnpm typecheck` and fix any errors
- [x] 2.7 Run `pnpm lint` and fix any errors
- [x] 2.8 Run `pnpm test` and fix any failures
- [x] 2.9 Run `pnpm test:e2e` and fix any failures
- [x] 2.10 Kill any vitest worker processes

## 3. Use `Path.join` in `service.ts`

- [x] 3.1 In `ensureGlobalWorkspaceInitialized`, replace template-string path concatenation (`${globalDir}/${SETTINGS_FILENAME}`, `${globalDir}/${LOCKFILE_NAME}`) with `Path.join` from the `Path` service
- [x] 3.2 Run `pnpm typecheck` and fix any errors
- [x] 3.3 Run `pnpm test` and fix any failures
- [x] 3.4 Kill any vitest worker processes

## 4. Replace native array methods with Effect `Array`

- [x] 4.1 In `display-plan.ts`: replace `plan.jobs.flatMap(...)` with `Array.flatMap(plan.jobs, ...)`; replace `.filter(...)` calls with `Array.filter(...)`
- [x] 4.2 In `apply-plan.ts`: replace `jobResults.map(...)` with `Array.map(jobResults, ...)`; add `import * as Array from "effect/Array"`
- [x] 4.3 Run `pnpm typecheck` and fix any errors
- [x] 4.4 Run `pnpm lint` and fix any errors
- [x] 4.5 Run `pnpm test` and fix any failures
- [x] 4.6 Kill any vitest worker processes

## 5. Change `agents` to `Option` on `WorkspaceContextOptions`

- [x] 5.1 Update `WorkspaceContextOptions` in `service.ts`: change `readonly agents?: readonly string[]` to `readonly agents: Option.Option<readonly string[]>`
- [x] 5.2 Update `initializeProjectWorkspace` in `service.ts` to use `Option.isSome`/`Option.getOrElse` instead of truthy checks on `options.agents`
- [x] 5.3 Update callers in handler files (`install/handler.ts`, `uninstall/handler.ts`) to wrap with `Option.some(...)` or `Option.none()`
- [x] 5.4 Update handler test files (`install/handler.test.ts`, `uninstall/handler.test.ts`, `init/handler.test.ts`) and `service.test.ts` to use `Option.some`/`Option.none` for `agents`
- [x] 5.5 Run `pnpm typecheck` and fix any errors
- [x] 5.6 Run `pnpm lint` and fix any errors
- [x] 5.7 Run `pnpm test` and fix any failures
- [x] 5.8 Run `pnpm test:e2e` and fix any failures
- [x] 5.9 Kill any vitest worker processes
