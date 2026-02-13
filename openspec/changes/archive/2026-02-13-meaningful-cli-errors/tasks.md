> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Settings + Callers

> **Subagent:** Run this entire phase in a single subagent.

Convert `readSettings`/`writeSettings` to `CliError`, return `Option<Settings>` for not-found. Update workspace/service.ts call sites. Delete domain error types.

- [ ] 1.1 Update tests for `readSettings` to expect `Option<Settings>` return type and `CliError` on parse/write failures (replace `SettingsNotFoundError`/`SettingsParseError`/`SettingsWriteError` assertions with `CliError` code assertions using `SETTINGS_PARSE_FAILED`, `SETTINGS_WRITE_FAILED`)
- [ ] 1.2 Update tests for workspace/service.ts callers (`readSettingsSafe`, `ensureProjectWorkspaceInitialized`) to use `Option.getOrElse`/`Option.match` instead of `catchTag("SettingsNotFoundError", ...)`
- [ ] 1.3 Convert `readSettings` in `settings/settings.ts` to return `Effect<Option<Settings>, CliError>` — return `Option.none()` on file-not-found, `CliError` with code `SETTINGS_PARSE_FAILED` on parse failure
- [ ] 1.4 Convert `writeSettings` in `settings/settings.ts` to return `Effect<void, CliError>` with code `SETTINGS_WRITE_FAILED`
- [ ] 1.5 Update workspace/service.ts call sites: `readSettingsSafe` (line 341-345) → `Option.getOrElse`, `ensureProjectWorkspaceInitialized` (line 274-279) → `Option.match`
- [ ] 1.6 Delete `SettingsNotFoundError`, `SettingsParseError`, `SettingsWriteError`, and `SettingsError` union type from `settings/settings.ts`
- [ ] 1.7 Update `settings/index.ts` barrel exports — remove domain error exports, ensure `CliError`-based functions are exported
- [ ] 1.8 Run `pnpm typecheck` and fix any type errors
- [ ] 1.9 Run `pnpm lint` and fix any lint errors
- [ ] 1.10 Run `pnpm test` and fix any test failures
- [ ] 1.11 Run `pnpm test:e2e` and fix any failures
- [ ] 1.12 Kill any vitest worker processes

## 2. Lockfile + Callers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1. Convert `readLockfile`/`writeLockfile` to `CliError`. Update workspace/service.ts. Delete domain error types.

- [ ] 2.1 Update tests for `readLockfile`/`writeLockfile` to expect `CliError` with codes `LOCKFILE_PARSE_FAILED`, `LOCKFILE_WRITE_FAILED` (replace `LockfileParseError`/`LockfileWriteError` assertions)
- [ ] 2.2 Convert `readLockfile` in `lockfile/lockfile.ts` to return `CliError` on parse failure (keep returning empty lockfile on file-not-found)
- [ ] 2.3 Convert `writeLockfile` in `lockfile/lockfile.ts` to return `CliError` with code `LOCKFILE_WRITE_FAILED`
- [ ] 2.4 Update workspace/service.ts lockfile call sites to use `CliError`
- [ ] 2.5 Delete `LockfileNotFoundError`, `LockfileParseError`, `LockfileWriteError`, and `LockfileError` union type from `lockfile/lockfile.ts`
- [ ] 2.6 Update `lockfile/index.ts` barrel exports — remove domain error exports
- [ ] 2.7 Run `pnpm typecheck` and fix any type errors
- [ ] 2.8 Run `pnpm lint` and fix any lint errors
- [ ] 2.9 Run `pnpm test` and fix any test failures
- [ ] 2.10 Run `pnpm test:e2e` and fix any failures
- [ ] 2.11 Kill any vitest worker processes

## 3. Git

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2. Convert git operations to `CliError`. Delete `GitError`.

- [ ] 3.1 Update tests for git operations to expect `CliError` with codes like `GIT_CLONE_FAILED`, `GIT_CHECKOUT_FAILED`, `GIT_RESOLVE_REF_FAILED` (replace `GitError` assertions)
- [ ] 3.2 Convert git functions (clone, checkout, resolve-ref, get-commit, get-tree-sha, is-git-repo) in `git/` to create `CliError` at the source
- [ ] 3.3 Delete `GitError` from `git/errors.ts` and update `git/index.ts` barrel exports
- [ ] 3.4 Run `pnpm typecheck` and fix any type errors
- [ ] 3.5 Run `pnpm lint` and fix any lint errors
- [ ] 3.6 Run `pnpm test` and fix any test failures
- [ ] 3.7 Run `pnpm test:e2e` and fix any failures
- [ ] 3.8 Kill any vitest worker processes

## 4. Utils (Symlink)

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3. Convert `createSymlink` to `CliError`. Update install-skill.ts recovery pattern.

- [ ] 4.1 Update tests for `createSymlink` to expect `CliError` with code `SYMLINK_CREATE_FAILED` (replace `SymlinkError` assertions)
- [ ] 4.2 Update tests for install-skill.ts symlink fallback to use `catchAll` instead of `catchTag("SymlinkError", ...)`
- [ ] 4.3 Convert `createSymlink` in `utils/create-symlink.ts` to create `CliError` at the source
- [ ] 4.4 Update `install-skill.ts` (line 105): replace `catchTag("SymlinkError", ...)` with `Effect.catchAll` on the symlink sub-expression
- [ ] 4.5 Delete `SymlinkError` from `utils/create-symlink.ts` and update `utils/index.ts` barrel exports
- [ ] 4.6 Run `pnpm typecheck` and fix any type errors
- [ ] 4.7 Run `pnpm lint` and fix any lint errors
- [ ] 4.8 Run `pnpm test` and fix any test failures
- [ ] 4.9 Run `pnpm test:e2e` and fix any failures
- [ ] 4.10 Kill any vitest worker processes

## 5. Sources + Resolution

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4. Convert source providers, resolve-source, GitHub API to `CliError`. Update `SourceProvidersService` interface.

> **Parallelization:** Tasks 5.1-5.2 (tests) are independent — can be written in parallel, but must complete before 5.3-5.7.

- [ ] 5.1 Update tests for source providers (local, git-hosting, registry) to expect `CliError` with codes like `SOURCE_PARSE_FAILED`, `SOURCE_CLONE_URL_FAILED`, `SOURCE_FETCH_FAILED`, `REGISTRY_FETCH_FAILED`, `REGISTRY_NOT_CONFIGURED` (replace `ParseError`/`CloneUrlError`/`SourceError`/`RegistryError`/`RegistryNotConfiguredError` assertions)
- [ ] 5.2 Update tests for GitHub API and resolution to expect `CliError` with codes like `GITHUB_API_FAILED`, `RESOLUTION_NOT_FOUND`, `RESOLUTION_AMBIGUOUS` (replace `GitHubApiError`/`ResolutionError` assertions)
- [ ] 5.3 Convert source provider functions in `sources/providers/local.ts`, `sources/providers/git-hosting.ts`, `sources/providers/registry.ts` to create `CliError` at the source
- [ ] 5.4 Convert `sources/errors.ts` (`ParseError`, `CloneUrlError`) usage sites to create `CliError` directly, then delete error types
- [ ] 5.5 Convert `sources/github/api.ts` to create `CliError` with code `GITHUB_API_FAILED`
- [ ] 5.6 Convert `resolution/` to create `CliError` at the source — delete `ResolutionError`
- [ ] 5.7 Update `SourceProvidersService` interface in `sources/service.ts`: change error types from `SourceError | SettingsError` to `CliError`, update type assertions on lines 207 and 214
- [ ] 5.8 Delete `ParseError`, `CloneUrlError` from `sources/errors.ts`, `SourceError`, `RegistryError`, `RegistryNotConfiguredError` from `sources/provider.ts`, `GitHubApiError` from `sources/github/api.ts`, `ResolutionError` from `resolution/errors.ts`
- [ ] 5.9 Update barrel exports: `sources/index.ts`, `resolution/index.ts` — remove domain error exports
- [ ] 5.10 Run `pnpm typecheck` and fix any type errors
- [ ] 5.11 Run `pnpm lint` and fix any lint errors
- [ ] 5.12 Run `pnpm test` and fix any test failures
- [ ] 5.13 Run `pnpm test:e2e` and fix any failures
- [ ] 5.14 Kill any vitest worker processes

## 6. TUI

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5. Convert `PromptError` → `CliError` in all TUI service implementations. Update callers.

- [ ] 6.1 Update tests for TUI services to expect `CliError` with code `PROMPT_RENDER_FAILED` instead of `PromptError`
- [ ] 6.2 Convert all 5 TUI service implementations (Confirm, Select, Multiselect, TextInput, PasswordInput) to create `CliError` with code `PROMPT_RENDER_FAILED` and howToFix `"Run with --yes to skip prompts, or ensure stdin is a terminal"` instead of `PromptError`
- [ ] 6.3 Update `Effect.async` type annotations in TUI services from `PromptError | PromptCancelled` to `CliError | PromptCancelled`
- [ ] 6.4 Update `ensure-agents.ts` (lines 110-111): replace `catchTag("PromptError", ...)` with `catchAll` that checks for `PromptCancelled` pass-through
- [ ] 6.5 Delete `PromptError` from `tui/errors.ts`, update `tui/index.ts` barrel exports (keep `PromptCancelled`)
- [ ] 6.6 Run `pnpm typecheck` and fix any type errors
- [ ] 6.7 Run `pnpm lint` and fix any lint errors
- [ ] 6.8 Run `pnpm test` and fix any test failures
- [ ] 6.9 Run `pnpm test:e2e` and fix any failures
- [ ] 6.10 Kill any vitest worker processes

## 7. Workspace Service

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 6. Convert remaining workspace errors to `CliError`. Update `WorkspaceContextService` interface.

- [ ] 7.1 Update tests for workspace service to expect `CliError` instead of `WorkspaceInitializationError`/`WorkspaceNotInitializedError`/`EnsureAgentsError`/`WorkspaceContextError`
- [ ] 7.2 Remove manual `_tag` check in workspace/service.ts (line 173) — TUI service now produces `CliError | PromptCancelled` directly, so the pass-through logic is unnecessary
- [ ] 7.3 Convert workspace service initialization errors to `CliError` — remove `mapError` wrappers that wrap into `WorkspaceInitializationError`
- [ ] 7.4 Convert `ensure-agents.ts`: replace `EnsureAgentsError` with `CliError` (code `AGENTS_NOT_CONFIGURED`)
- [ ] 7.5 Update `WorkspaceContextService` interface: change all method signatures from domain error types to `CliError` (or `CliError | PromptCancelled`)
- [ ] 7.6 Delete `WorkspaceInitializationError`, `WorkspaceNotInitializedError` from `workspace/errors.ts`, `EnsureAgentsError` from `workspace/ensure-agents.ts`, `WorkspaceContextError` union from `workspace/service.ts`
- [ ] 7.7 Update `workspace/index.ts` barrel exports — remove domain error exports
- [ ] 7.8 Run `pnpm typecheck` and fix any type errors
- [ ] 7.9 Run `pnpm lint` and fix any lint errors
- [ ] 7.10 Run `pnpm test` and fix any test failures
- [ ] 7.11 Run `pnpm test:e2e` and fix any failures
- [ ] 7.12 Kill any vitest worker processes

## 8. Apply-Plan

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7. Convert `OperationHandler`/`Handlers`/`ExecutionContext` to `CliError`. Update `applyStep`.

- [ ] 8.1 Update tests for `applyPlan`/`applyStep` to use `CliError` instead of `OperationError`
- [ ] 8.2 Update `OperationHandler`, `Handlers`, and `ExecutionContext` type definitions in `workspace/apply-plan.ts` from `OperationError` to `CliError`
- [ ] 8.3 Change `applyStep` `catchTag("OperationError", ...)` (line 87) to `Effect.catchAll` on the handler sub-expression
- [ ] 8.4 Delete `OperationError` from `workspace/apply-plan.ts`
- [ ] 8.5 Update operation handler implementations in `publish-skill.ts`, `copy-skill.ts`, `install-skill.ts` to create `CliError` instead of `OperationError`
- [ ] 8.6 Run `pnpm typecheck` and fix any type errors
- [ ] 8.7 Run `pnpm lint` and fix any lint errors
- [ ] 8.8 Run `pnpm test` and fix any test failures
- [ ] 8.9 Run `pnpm test:e2e` and fix any failures
- [ ] 8.10 Kill any vitest worker processes

## 9. Handlers + Skills Utilities

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 8. Remove handler `mapError` wrappers. Convert `SkillsError`, `DiscoveryError`, `DetectionError`.

> **Parallelization:** Tasks 9.3, 9.4, 9.5 are independent — launch as parallel subagents.

- [ ] 9.1 Update tests for skills utilities and agent detection to expect `CliError` codes instead of `SkillsError`/`DiscoveryError`/`DetectionError`
- [ ] 9.2 Update handler tests to reflect removed `mapError` wrappers (errors now arrive as `CliError` from source)
- [ ] 9.3 Convert `SkillsError` in `cli-commands/skills/utils.ts` to create `CliError` at the source (code `SKILLS_OPERATION_FAILED`)
- [ ] 9.4 Convert `DiscoveryError` in `cli-commands/skills/install/discover-skills.ts` to create `CliError` at the source (code `SKILLS_DISCOVERY_FAILED`)
- [ ] 9.5 Convert `DetectionError` in `agents/detection.ts` to create `CliError` at the source (code `AGENT_DETECTION_FAILED`)
- [ ] 9.6 Remove handler-level `mapError` wrappers across all command handlers (init, skills list, skills install, skills publish, skills fork, etc.) — errors now flow through as `CliError`
- [ ] 9.7 Delete `SkillsError`, `DiscoveryError`, `DetectionError` and update barrel exports (`agents/index.ts`)
- [ ] 9.8 Run `pnpm typecheck` and fix any type errors
- [ ] 9.9 Run `pnpm lint` and fix any lint errors
- [ ] 9.10 Run `pnpm test` and fix any test failures
- [ ] 9.11 Run `pnpm test:e2e` and fix any failures
- [ ] 9.12 Kill any vitest worker processes

## 10. Runtime

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 9. Constrain `run` to `CliError | PromptCancelled`. Type `classifyError` properly.

- [ ] 10.1 Update tests for `classifyError` to use typed `CliError | PromptCancelled` input instead of `unknown`
- [ ] 10.2 Change `run` signature in `runtime/index.ts` from generic `E` to `CliError | PromptCancelled` — remove the `E` type parameter
- [ ] 10.3 Type `classifyError` in `runtime/error-handling.ts` as `(error: CliError | PromptCancelled) => ErrorClassification` with `_tag` pattern matching instead of duck-typing
- [ ] 10.4 Run `pnpm typecheck` — this is the forcing function that catches any unmapped errors across the entire codebase. Fix all type errors.
- [ ] 10.5 Run `pnpm lint` and fix any lint errors
- [ ] 10.6 Run `pnpm test` and fix any test failures
- [ ] 10.7 Run `pnpm test:e2e` and fix any failures
- [ ] 10.8 Kill any vitest worker processes

## 11. Cleanup

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 10. Delete empty error files, remove stale barrel exports, remove unused imports.

- [ ] 11.1 Delete empty or unused error files: `sources/errors.ts`, `git/errors.ts`, `workspace/errors.ts`, `resolution/errors.ts`, `tui/errors.ts` (if only `PromptCancelled` remains, keep it)
- [ ] 11.2 Remove stale domain error imports/exports from all barrel `index.ts` files
- [ ] 11.3 Remove any unused `ResolutionErrorCode` enum if no longer referenced
- [ ] 11.4 Run `pnpm typecheck` and fix any type errors
- [ ] 11.5 Run `pnpm lint` and fix any lint errors
- [ ] 11.6 Run `pnpm test` and fix any test failures
- [ ] 11.7 Run `pnpm test:e2e` and fix any failures
- [ ] 11.8 Kill any vitest worker processes
