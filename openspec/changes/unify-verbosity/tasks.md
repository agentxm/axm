> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Extend `CliFlagsService` with verbose/debug

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add tests for verbose/debug resolution in `makeCliFlagsLayer`: flag-only, env-only, debug-implies-verbose, flag-overrides-env, defaults to false
- [ ] 1.2 Add `verbose` and `debug` to `CliFlagsService` interface in `packages/core/src/unstable/cli-flags/index.ts`
- [ ] 1.3 Add `envVerbose` and `envDebug` optional boolean fields to `makeCliFlagsLayer` options
- [ ] 1.4 Resolve `verbose`/`debug` in `makeCliFlagsLayer` by combining `yield* verboseFlag` / `yield* debugFlag` with env var options, with `debug` implying `verbose`
- [ ] 1.5 Add `verbose: false` and `debug: false` defaults to `CliFlagsTest` helper
- [ ] 1.6 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 1.7 Run `pnpm lint` for all packages, fix any errors
- [ ] 1.8 Run `pnpm test` for all packages, fix any failures
- [ ] 1.9 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 1.10 Kill any vitest worker processes

## 2. Remove `appErrorRenderOptions` threading from core

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [ ] 2.1 Update `writeExpectedCliError` in `runtime-envelope.ts` to read `yield* verboseFlag` and `yield* debugFlag` directly instead of accepting `appErrorRenderOptions` in options
- [ ] 2.2 Remove `appErrorRenderOptions` from `withCliErrorHandling` options parameter
- [ ] 2.3 Remove `appErrorRenderOptions` from `WithCliRuntimeOptions` interface
- [ ] 2.4 Remove `appErrorRenderOptions` from `withCliRuntime` pass-through
- [ ] 2.5 Delete `RenderAppErrorOptions` named type from `packages/core/src/unstable/app-error/render.ts` — replace `renderAppError` second parameter with inline `{ readonly verbose: boolean; readonly debug: boolean }`
- [ ] 2.6 Remove `RenderAppErrorOptions` from the barrel export in `packages/core/src/unstable/app-error/index.ts`
- [ ] 2.7 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 2.8 Run `pnpm lint` for all packages, fix any errors
- [ ] 2.9 Run `pnpm test` for all packages, fix any failures
- [ ] 2.10 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 2.11 Kill any vitest worker processes

## 3. Update main CLI runtime to use `CliFlags` for verbosity

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2.

- [ ] 3.1 Pass `envVerbose` and `envDebug` (from `CliEnvConfig`) to `makeFoundationLayer`/`makeCliFlagsLayer` in `packages/cli/src/runtime.ts`
- [ ] 3.2 Remove `diagnosticVerbosity` from `resolveRuntimeConfig()` return value
- [ ] 3.3 Remove `resolveDiagnosticVerbosity` import and call from `packages/cli/src/runtime.ts`
- [ ] 3.4 Update `makeDebugLoggerLayer` to accept a boolean `debug` parameter instead of `DiagnosticVerbosity` — read from resolved `CliFlags` at the call site
- [ ] 3.5 Remove `appErrorRenderOptions: config.diagnosticVerbosity` from `withCliErrorHandling` call in `withRuntime`
- [ ] 3.6 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 3.7 Run `pnpm lint` for all packages, fix any errors
- [ ] 3.8 Run `pnpm test` for all packages, fix any failures
- [ ] 3.9 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 3.10 Kill any vitest worker processes

## 4. Update workspace and display-plan to read from `CliFlags`

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2.

> **Parallelization:** Tasks 4.1–4.2 and 4.3–4.4 are independent — launch as parallel subagents.

- [ ] 4.1 Update `displayPlan` in `packages/cli/src/workspace/display-plan.ts` to accept `{ verbose: boolean; debug: boolean }` instead of `RenderAppErrorOptions` — remove the `defaultVerbosity` constant and `DisplayPlanOptions` type if no longer needed
- [ ] 4.2 Update `displayPlan` call site in `packages/cli/src/workspace/service.ts` to read from `CliFlags` service instead of calling `resolveDiagnosticVerbosity()`
- [ ] 4.3 Remove `resolveDiagnosticVerbosity` import from `packages/cli/src/workspace/service.ts`
- [ ] 4.4 Remove `RenderAppErrorOptions` import from `packages/cli/src/workspace/display-plan.ts`
- [ ] 4.5 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 4.6 Run `pnpm lint` for all packages, fix any errors
- [ ] 4.7 Run `pnpm test` for all packages, fix any failures
- [ ] 4.8 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 4.9 Kill any vitest worker processes

## 5. Delete dead code

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 3, 4.

- [ ] 5.1 Delete `classifyError` function from `packages/cli/src/runtime/error-handling.ts`
- [ ] 5.2 Delete `classifyError` tests from `packages/cli/src/runtime/runtime.test.ts`
- [ ] 5.3 Delete `DiagnosticVerbosity` interface and `VerbosityEnvValues` interface from `packages/cli/src/runtime/error-handling.ts`
- [ ] 5.4 Delete `resolveDiagnosticVerbosity` function from `packages/cli/src/runtime/error-handling.ts`
- [ ] 5.5 Delete `resolveDiagnosticVerbosity` tests from `packages/cli/src/runtime/runtime.test.ts` (if any remain)
- [ ] 5.6 Remove any now-unused imports (`renderAppError` from error-handling.ts, etc.)
- [ ] 5.7 If `error-handling.ts` is empty after deletions, delete the file and update imports
- [ ] 5.8 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 5.9 Run `pnpm lint` for all packages, fix any errors
- [ ] 5.10 Run `pnpm test` for all packages, fix any failures
- [ ] 5.11 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 5.12 Kill any vitest worker processes
