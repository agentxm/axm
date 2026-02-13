> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. CliError type and rendering

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Create `packages/cli/src/cli-error/cli-error.ts` with `CliError` TaggedError (code, what, details, howToFix, cause) and convenience factory
- [ ] 1.2 Create `packages/cli/src/cli-error/render.ts` with `renderCliError` (formats `✗ {what} ({code})\n  {details}\n  {howToFix}`) and `renderDefect` (bug diagnostic with report suggestion)
- [ ] 1.3 Create `packages/cli/src/cli-error/index.ts` barrel exporting public API
- [ ] 1.4 Write tests for `CliError` construction scenarios (all fields, no howToFix, empty details) in `cli-error.test.ts`
- [ ] 1.5 Write tests for `renderCliError` output format (all fields, no howToFix, empty details) and `renderDefect` output in `render.test.ts`
- [ ] 1.6 Run `pnpm typecheck` — fix any errors
- [ ] 1.7 Run `pnpm lint` — fix any errors
- [ ] 1.8 Run `pnpm test` — fix any failures
- [ ] 1.9 Kill any vitest worker processes

## 2. Standardize domain error `cause` fields

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 Change `GitError` in `packages/cli/src/git/errors.ts`: `cause: Option.Option<unknown>` → `cause: unknown`
- [ ] 2.2 Update all `GitError` callers to pass `undefined` instead of `Option.none()` and the raw error instead of `Option.some(error)`
- [ ] 2.3 Change `PromptError` in `packages/cli/src/tui/errors.ts`: `cause: Option.Option<unknown>` → `cause: unknown`
- [ ] 2.4 Update all `PromptError` callers to pass `undefined` instead of `Option.none()` and the raw error instead of `Option.some(error)`
- [ ] 2.5 Change `WorkspaceInitializationError` in `packages/cli/src/workspace/errors.ts`: `cause?: unknown` → `cause: unknown`
- [ ] 2.6 Update all `WorkspaceInitializationError` callers to pass `undefined` when no cause
- [ ] 2.7 Update any tests that construct these errors with the old patterns
- [ ] 2.8 Run `pnpm typecheck` — fix any errors
- [ ] 2.9 Run `pnpm lint` — fix any errors
- [ ] 2.10 Run `pnpm test` — fix any failures
- [ ] 2.11 Run `pnpm test:e2e` — fix any failures
- [ ] 2.12 Kill any vitest worker processes

## 3. Runtime boundary update

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 3.1 Update `run()` in `packages/cli/src/runtime/index.ts` to use the three-tier catch: `catchTag("PromptCancelled")` → exit 0, `catchTag("CliError")` → `renderCliError` + exit 1, `catchAll` → `renderDefect` + exit 2
- [ ] 3.2 Write handler-level tests verifying the runtime boundary behavior (CliError renders and exits 1, PromptCancelled exits 0, untyped error renders defect and exits 2)
- [ ] 3.3 Run `pnpm typecheck` — fix any errors
- [ ] 3.4 Run `pnpm lint` — fix any errors
- [ ] 3.5 Run `pnpm test` — fix any failures
- [ ] 3.6 Kill any vitest worker processes

## 4. Migrate handlers to CliError

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7 are independent — launch as parallel subagents.

Depends on: Phases 1, 2, 3

- [ ] 4.1 Migrate `install` handler: replace `InstallError` with `mapError` to `CliError`, remove `InstallError` type, update tests
- [ ] 4.2 Migrate `fork` handler: replace `ForkError` with `mapError` to `CliError`, remove `ForkError` type, update tests
- [ ] 4.3 Migrate `publish` handler: replace `PublishError` with `mapError` to `CliError`, remove `PublishError` type, update tests
- [ ] 4.4 Migrate `update` handler: replace `UpdateError` with `mapError` to `CliError`, remove `UpdateError` type, update tests
- [ ] 4.5 Migrate `init` handler: add `mapError` to `CliError` for domain errors, update tests
- [ ] 4.6 Migrate `list` handler: add `mapError` to `CliError` for domain errors, update tests
- [ ] 4.7 Migrate `uninstall` handler: add `mapError` to `CliError` for domain errors, update tests
- [ ] 4.8 Run `pnpm typecheck` — fix any errors
- [ ] 4.9 Run `pnpm lint` — fix any errors
- [ ] 4.10 Run `pnpm test` — fix any failures
- [ ] 4.11 Run `pnpm test:e2e` — fix any failures
- [ ] 4.12 Kill any vitest worker processes

## 5. Remove legacy error formatting

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4

- [ ] 5.1 Remove `formatError` and `formatEmptyResolutionError` from `packages/cli/src/utils/errors.ts`
- [ ] 5.2 Remove any now-unused imports/exports from `packages/cli/src/utils/index.ts`
- [ ] 5.3 Remove handler-specific error types (`InstallError`, `ForkError`, `PublishError`, `UpdateError`) if not already removed in Phase 4
- [ ] 5.4 Run `pnpm typecheck` — fix any errors
- [ ] 5.5 Run `pnpm lint` — fix any errors
- [ ] 5.6 Run `pnpm test` — fix any failures
- [ ] 5.7 Run `pnpm test:e2e` — fix any failures
- [ ] 5.8 Kill any vitest worker processes

## 6. Spinner error cleanup

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3

- [ ] 6.1 Ensure active spinners are stopped before error rendering at the runtime boundary — add `Effect.ensuring` or equivalent cleanup in `run()` so spinners display a failure indicator on error
- [ ] 6.2 Write test verifying spinner is stopped when handler effect fails
- [ ] 6.3 Run `pnpm typecheck` — fix any errors
- [ ] 6.4 Run `pnpm lint` — fix any errors
- [ ] 6.5 Run `pnpm test` — fix any failures
- [ ] 6.6 Kill any vitest worker processes

## 7. Add `Effect.withSpan` to key operations

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4

- [ ] 7.1 Add `Effect.withSpan` to source resolution operations in `packages/cli/src/resolution/`
- [ ] 7.2 Add `Effect.withSpan` to git operations in `packages/cli/src/git/`
- [ ] 7.3 Add `Effect.withSpan` to plan execution in handler I/O operations (install, fork, publish, update)
- [ ] 7.4 Run `pnpm typecheck` — fix any errors
- [ ] 7.5 Run `pnpm lint` — fix any errors
- [ ] 7.6 Run `pnpm test` — fix any failures
- [ ] 7.7 Run `pnpm test:e2e` — fix any failures
- [ ] 7.8 Kill any vitest worker processes
