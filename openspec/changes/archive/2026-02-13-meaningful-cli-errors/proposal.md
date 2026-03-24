## Why

When errors reach the CLI surface, they often lose the specific context that would help users understand what went wrong and how to fix it. The root cause is a two-layer error model (domain errors → AppError) where context is lost in translation. Three handlers use blanket catch-all `mapError` that flatten diverse errors into "Failed to X". Four handlers have gaps where errors escape unmapped, becoming defects (exit code 2). The runtime accepts any error type, so none of this is caught at compile time.

Domain errors exist across ~20 types in 10+ modules but serve primarily as intermediaries on their way to `AppError`. Five `catchTag` recovery patterns exist (settings not-found → defaults, prompt cancelled/error → false, symlink failure → copy fallback, operation error → error result), but none require distinct domain error types — they can use `catchAll` on scoped sub-expressions or `Option` patterns instead. The code closest to the failure has the best context for `what`, `details`, and `howToFix`, but that context is discarded when a handler three layers up wraps everything in a generic message.

## What Changes

- **Eliminate domain errors** — Delete `ParseError`, `SourceError`, `CloneUrlError`, `OperationError`, `SymlinkError`, `DetectionError`, `WorkspaceInitializationError`, `WorkspaceNotInitializedError`, `SettingsParseError`, `SettingsWriteError`, `SettingsNotFoundError`, `LockfileParseError`, `LockfileWriteError`, `LockfileNotFoundError`, `GitError`, `RegistryError`, `RegistryNotConfiguredError`, `GitHubApiError`, `ResolutionError`, `SkillsError`, `DiscoveryError`, `EnsureAgentsError`, `PromptError`, and all error union types (`SettingsError`, `LockfileError`, `WorkspaceContextError`). Replace with `AppError` created at the point of failure.
- **Create `AppError` at the source** — Where code currently creates a domain error (e.g., `new SourceError({...})`), create an `AppError` with specific `code`, `what`, `details`, and `howToFix` instead. The code that knows "I failed to clone the repo" produces the best error message.
- **Replace recovery patterns** — `SettingsNotFoundError` catchTag → `Option` return from `readSettings`. Other `catchTag` patterns → `catchAll` on scoped sub-expressions.
- **Update service interface signatures** — `WorkspaceContextService`, `SourceProvidersService`, and TUI service interfaces change from domain error types to `AppError` (plus `PromptCancelled` where prompts are involved).
- **Remove handler-level `mapError` wrappers** — Handlers no longer need catch-all or granular `mapError` to convert domain errors. Errors arrive as `AppError` already.
- **Type the runtime error channel** — Change `run` from `Effect.Effect<A, E, ...>` (any error) to `Effect.Effect<A, AppError | PromptCancelled, ...>`. TypeScript enforces that all expected errors are `AppError` at compile time. Unmapped errors become build failures, not runtime surprises.
- **Keep `PromptCancelled` as-is** — It's a control flow signal (exit 0), not an error. The runtime already handles it correctly.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `cli-error`: AppError becomes the single error type for all expected failures. Created at the point of failure instead of mapped at handler boundaries. Runtime enforces `AppError | PromptCancelled` on the error channel.

## Impact

- **Runtime**: `run` signature changes to constrain error channel to `AppError | PromptCancelled`
- **CLI handlers**: All 7 command handlers — remove `mapError` wrappers
- **Service interfaces**: `WorkspaceContextService`, `SourceProvidersService`, TUI services — update error types in method signatures
- **Domain error files**: Delete error definitions across `sources/`, `workspace/`, `lockfile/`, `settings/`, `git/`, `resolution/`, `tui/`, `agents/`, `cli-commands/skills/`, `utils/`
- **All call sites**: Every `new DomainError({...})` becomes `makeAppError({...})` with full context
- **Recovery patterns**: 5 `catchTag` patterns rewritten (1 → Option, 1 unchanged, 3 → catchAll)
- **Tests**: ~10+ assertions on domain error `_tag` values change to assert on AppError `code` instead
- **Error rendering**: No changes — `render.ts` already supports `details` and `howToFix`, they'll just be populated now
