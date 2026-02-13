## Context

The codebase has ~20 domain error types across 10+ modules, all extending `Data.TaggedError`. The two-layer model (domain error → CliError) loses context in translation — handlers wrap diverse domain errors into generic "Failed to X" messages, or leave gaps where domain errors escape to the runtime as defects.

The runtime `run` function accepts any error type (`E`). The `classifyError` function duck-types on `_tag` at runtime to distinguish `CliError` from `PromptCancelled` from defects. Domain errors that escape handler `mapError` wrappers silently become defects (exit code 2).

Domain errors appear in service interface signatures (`SettingsError`, `LockfileError`, `SourceError`, `PromptError` in `WorkspaceContextService` and `SourceProvidersService`). Five `catchTag` recovery patterns exist:

- `SettingsNotFoundError` → fall back to default settings (2 places in workspace/service.ts)
- `PromptCancelled` → return false (ensure-agents.ts)
- `PromptError` → return false (ensure-agents.ts)
- `SymlinkError` → fall back to directory copy (install-skill.ts)
- `OperationError` → convert to error result in plan execution (apply-plan.ts)

Additionally, workspace/service.ts has a manual `_tag` check (line 173) that passes `PromptCancelled` through while wrapping other errors in `WorkspaceInitializationError`.

Dead code: `LockfileNotFoundError` and `WorkspaceNotInitializedError` are defined but never instantiated. `readLockfile` already handles file-not-found gracefully by returning an empty lockfile.

## Goals / Non-Goals

**Goals:**

- Single error type (`CliError`) for all user-facing failures, created at the point of failure
- Compile-time enforcement: runtime `run` only accepts `CliError | PromptCancelled` on the error channel
- Every CLI error carries specific `code`, `what`, `details`, and `howToFix` from the code that knows best
- Eliminate all domain error types and their associated unions, barrel exports, and `mapError` wrappers
- Update service interface signatures to use `CliError` instead of domain error types

**Non-Goals:**

- Backward compatibility with domain error types
- Changing `CliError` fields or rendering logic (already well-designed)
- Changing `PromptCancelled` behavior (already correct)
- Adding error recovery/retry logic

## Decisions

### 1. Eliminate domain errors — use `CliError` at the source

**Decision**: Delete all domain error types. Where code currently creates `new SourceError({...})`, create `makeCliError({...})` with full context instead. Service interface signatures change from domain error types to `CliError`.

**Full list of error types to delete** (23 types):

- settings: `SettingsNotFoundError`, `SettingsParseError`, `SettingsWriteError`, `SettingsError` (union)
- lockfile: `LockfileNotFoundError`, `LockfileParseError`, `LockfileWriteError`, `LockfileError` (union)
- workspace: `WorkspaceNotInitializedError`, `WorkspaceInitializationError`, `WorkspaceContextError` (union), `OperationError`, `EnsureAgentsError`
- sources: `ParseError`, `CloneUrlError`, `SourceError`, `RegistryError`, `RegistryNotConfiguredError`, `GitHubApiError`
- resolution: `ResolutionError`
- git: `GitError`
- tui: `PromptError`
- cli-commands: `SkillsError`, `DiscoveryError`
- utils: `SymlinkError`
- agents: `DetectionError`

**Rationale**: Domain errors are intermediaries that lose context. The code that knows "I failed to clone from github:owner/repo" can produce a better error message than a handler three layers up that wraps everything in "Failed to install skill".

**Alternative considered**: Keep domain errors but enrich them with `code`, `details`, `howToFix` fields, then auto-map to CliError. Rejected because it duplicates CliError's structure inside every domain error.

### 2. Recovery patterns use `catchAll` on scoped sub-expressions

**Decision**: Where code currently uses `catchTag("SymlinkError", ...)` or `catchTag("OperationError", ...)` for recovery, replace with `Effect.catchAll` on the specific sub-expression. This is safe because the error channel of the sub-expression is already narrowed to that operation's errors.

Five recovery patterns and how each changes:

| Current pattern                                               | New pattern                                                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `readSettings().pipe(catchTag("SettingsNotFoundError", ...))` | `readSettings()` returns `Option<Settings>` — use `Option.getOrElse` (see Decision 4)                    |
| `prompt().pipe(catchTag("PromptCancelled", ...))`             | Unchanged — `PromptCancelled` stays as-is, `catchTag` still works                                        |
| `prompt().pipe(catchTag("PromptError", ...))`                 | `prompt().pipe(Effect.catchAll((e) => e._tag === "PromptCancelled" ? ... : Effect.succeed(false)))`      |
| `createSymlink().pipe(catchTag("SymlinkError", ...))`         | `createSymlink().pipe(Effect.catchAll(() => copySkillDirectory(...)))`                                   |
| `handler(op).pipe(catchTag("OperationError", ...))`           | `handler(op).pipe(Effect.catchAll((error) => Effect.succeed({ result: "error", message: error.what })))` |

The workspace service manual `_tag` check (line 173: `if (error._tag === "PromptCancelled") return error`) becomes unnecessary — once `PromptError` becomes `CliError`, the multiselect prompt's error channel is `CliError | PromptCancelled`. The `mapError` wrapper that converts non-cancelled errors to `WorkspaceInitializationError` is removed because the TUI service already produces a `CliError` with good context.

**Why scoped `catchAll` is safe**: `catchAll` on a sub-expression only catches errors from that sub-expression. If `createSymlink` returns `Effect<void, CliError>`, then `catchAll` on that specific pipe only catches symlink-related CliErrors, not unrelated ones from other operations. The error channel scope is already narrow.

### 3. `PromptCancelled` stays; `PromptError` becomes `CliError`

**Decision**: `PromptCancelled` remains a distinct type — it's a control flow signal (exit 0), not an error. `PromptError` becomes `CliError` — it represents a real failure ("stdin closed unexpectedly") that should produce a user-facing error message.

**TUI service interfaces change** (affects 5 services: Confirm, Select, Multiselect, TextInput, PasswordInput):

```
Before: prompt() => Effect<T, PromptError | PromptCancelled>
After:  prompt() => Effect<T, CliError | PromptCancelled>
```

**TUI service implementations change**: Where services currently create `new PromptError({...})`, they create `makeCliError({...})` instead. Since TUI services don't know the business context (whether the prompt is for "agent selection" or "skill selection"), they produce generic but still useful CliErrors:

```
code: "PROMPT_RENDER_FAILED"
what: "Failed to render interactive prompt"
howToFix: "Run with --yes to skip prompts, or ensure stdin is a terminal"
```

Callers that want richer context can still enrich with `mapError` on the sub-expression (the exception noted in Decision 8).

**`Effect.async` type annotations**: TUI services use `Effect.async<T, PromptError | PromptCancelled>` which must change to `Effect.async<T, CliError | PromptCancelled>`.

**Rationale**: `PromptCancelled` triggers exit 0 with no error output — it's semantically different from all other errors. `PromptError` is "the prompt crashed" — it should explain what happened and suggest a fix, which is exactly what `CliError` does.

### 4. Replace "not found" control flow errors with `Option`

**Decision**: `readSettings` returns `Effect<Option<Settings>, CliError>` instead of failing with `SettingsNotFoundError`. Callers use `Option.getOrElse` for defaults or produce a CliError when settings are required.

`readLockfile` already returns an empty lockfile on file-not-found — no change needed. `LockfileNotFoundError` and `WorkspaceNotInitializedError` are dead code (never instantiated) — just delete them.

**Call site changes** (3 places in workspace/service.ts):

- `readSettingsSafe` (line 341-345): Currently `readSettings(dir).pipe(catchTag("SettingsNotFoundError", ...))`. Becomes `readSettings(dir).pipe(Effect.map(Option.getOrElse(() => createDefaultSettings())))`.
- `ensureProjectWorkspaceInitialized` (line 274-279): Currently `readSettings(localDir).pipe(Effect.map(s => ({ found: true, settings: s })), catchTag("SettingsNotFoundError", ...))`. Becomes `readSettings(localDir).pipe(Effect.map(Option.match({ onNone: () => ({ found: false, settings: createDefaultSettings() }), onSome: (s) => ({ found: true, settings: s }) })))`.
- `ensureGlobalWorkspaceInitialized` (line 230-238): Currently checks `fs.exists(settingsPath)` then calls `writeSettings` if missing. This pattern doesn't use `SettingsNotFoundError` — no change needed.

### 5. Type the runtime error channel as `CliError | PromptCancelled`

**Decision**: Change `run` signature from `Effect.Effect<A, E, ...>` to `Effect.Effect<A, CliError | PromptCancelled, ...>`. Remove the `E` type parameter. Type `classifyError` as `(error: CliError | PromptCancelled) => ErrorClassification` with proper pattern matching on `_tag` instead of duck-typing.

**Workspace layer error type**: The workspace layer (`Layer.effect(Workspace, make(options))`) produces errors during construction (from `ensureGlobalWorkspaceInitialized` and `ensureProjectWorkspaceInitialized`). After this change, those construction errors will be `CliError` instead of `WorkspaceInitializationError | SettingsError | ...`. When the runtime provides the workspace layer via `Effect.provide`, layer construction errors flow into the main effect's error channel. Since those errors are now `CliError`, they satisfy the `CliError | PromptCancelled` constraint.

**Rationale**: Compile-time enforcement means unmapped errors are build failures, not runtime surprises (exit code 2). This is the forcing function that ensures completeness.

### 6. Service interface signatures use `CliError`

**Decision**: Service method signatures change from domain error types to `CliError`.

**WorkspaceContextService** (workspace/service.ts):

```
Before: getLockedSkills() => Effect<SkillsLockMap, LockfileError>
After:  getLockedSkills() => Effect<SkillsLockMap, CliError>

Before: getConfiguredSources() => Effect<ReadonlyArray<SourceConfig>, SettingsError>
After:  getConfiguredSources() => Effect<ReadonlyArray<SourceConfig>, CliError>

Before: resolvePlan(...) => Effect<Plan<Op>, PromptCancelled | PromptError, ...>
After:  resolvePlan(...) => Effect<Plan<Op>, CliError | PromptCancelled, ...>
```

**SourceProvidersService** (sources/service.ts):

```
Before: resolveExtension(...) => Effect<ReadonlyArray<ExtensionRef>, SourceError | SettingsError, ...>
After:  resolveExtension(...) => Effect<ReadonlyArray<ExtensionRef>, CliError, ...>
```

Note: `SourceProvidersLive` currently uses type assertions (`as Effect.Effect<..., SourceError | SettingsError, ...>`) on lines 207 and 214 of sources/service.ts. These must change to `CliError`.

**`WorkspaceContextError` union**: Delete entirely — it's replaced by `CliError | PromptCancelled` everywhere it appeared.

**Rationale**: No caller pattern-matches on specific service error types for recovery. The service methods already know the best context for their errors.

### 7. `OperationHandler` type definitions change to `CliError`

**Decision**: Update the `OperationHandler`, `Handlers`, and `ExecutionContext` type definitions in workspace/apply-plan.ts:

```
Before: OperationHandler<Op, R> = (op: Op) => Effect<OperationResult, OperationError, R>
After:  OperationHandler<Op, R> = (op: Op) => Effect<OperationResult, CliError, R>

Before: Handlers<Op>[K] = (...) => Effect<OperationResult, OperationError, any>
After:  Handlers<Op>[K] = (...) => Effect<OperationResult, CliError, any>

Before: ExecutionContext extracts R from Effect<OperationResult, OperationError, infer R>
After:  ExecutionContext extracts R from Effect<OperationResult, CliError, infer R>
```

The `applyStep` function changes `catchTag("OperationError", ...)` to `catchAll(...)`. Since `applyPlan` returns `Effect<Plan<Op>, never, ...>` (all errors are caught and converted to results), the change is contained within apply-plan.ts.

**Rationale**: The `OperationError` type adds no value beyond what `CliError` provides. Handlers already know the operation name and failure context when they create errors.

### 8. Error code naming convention

**Decision**: Use `AREA_REASON` format — e.g., `SETTINGS_PARSE_FAILED`, `SOURCE_CLONE_FAILED`, `LOCKFILE_WRITE_FAILED`. Area is the module/feature, reason is the specific failure.

**Rationale**: Hierarchical codes are greppable, unique, and self-documenting. They replace domain error tags in test assertions: `expect(error._tag).toBe("SettingsParseError")` → `expect(error.code).toBe("SETTINGS_PARSE_FAILED")`.

### 9. Handler `mapError` wrappers become unnecessary

**Decision**: Remove handler-level `mapError` wrappers. Since errors arrive as `CliError` from the source, handlers just compose effects without error transformation.

**Exception**: Handlers may still use `mapError` to enrich an existing `CliError` with handler-specific context (e.g., appending the `--source` flag value to `details`). Similarly, workspace service initialization can enrich TUI errors with business context.

### 10. `makeCliError` stays a pure function, importable anywhere

**Decision**: `makeCliError` is imported directly by any module that needs to create errors. No service abstraction — it's a pure function with no dependencies.

**Rationale**: Error creation shouldn't require a service layer. `cli-error/` has no imports from the rest of the codebase, so no circular dependency risk.

### 11. Migration by conversion wave, runtime constraint last

**Decision**: Convert in waves. Each wave converts a module AND updates its immediate callers so the codebase typechecks after each wave. Add the runtime type constraint as the final step.

Changing `readSettings` to return `Option<Settings>` requires updating all callers of `readSettings` in the same wave. Changing TUI services requires updating all prompt call sites. The migration can't be strictly "one module at a time" — it's "one conversion wave at a time."

**Migration waves**:

1. **Settings + callers**: Convert `readSettings`/`writeSettings` to `CliError`, return `Option<Settings>` for not-found. Update workspace/service.ts call sites (`readSettingsSafe`, `ensureProjectWorkspaceInitialized`, `ensureGlobalWorkspaceInitialized`). Delete `SettingsNotFoundError`, `SettingsParseError`, `SettingsWriteError`, `SettingsError`.
2. **Lockfile + callers**: Convert `readLockfile`/`writeLockfile` to `CliError`. Update workspace/service.ts. Delete `LockfileNotFoundError`, `LockfileParseError`, `LockfileWriteError`, `LockfileError`.
3. **Git**: Convert git operations to `CliError`. Delete `GitError`.
4. **Utils**: Convert `createSymlink` to `CliError`. Update install-skill.ts `catchTag` → `catchAll`. Delete `SymlinkError`.
5. **Sources + resolution**: Convert source providers, resolve-source, github API to `CliError`. Update `SourceProvidersService` interface and type assertions. Delete `ParseError`, `CloneUrlError`, `SourceError`, `RegistryError`, `RegistryNotConfiguredError`, `GitHubApiError`, `ResolutionError`.
6. **TUI**: Convert `PromptError` → `CliError` in all 5 TUI service implementations. Update `Effect.async` type annotations. Update workspace service manual `_tag` check and ensure-agents `catchTag`. Delete `PromptError`.
7. **Workspace service**: Convert remaining workspace errors to `CliError`. Update `WorkspaceContextService` interface. Delete `WorkspaceInitializationError`, `WorkspaceNotInitializedError`, `WorkspaceContextError`, `EnsureAgentsError`.
8. **Apply-plan**: Convert `OperationHandler`/`Handlers`/`ExecutionContext` to `CliError`. Change `catchTag` → `catchAll` in `applyStep`. Delete `OperationError`.
9. **Handlers + skills utilities**: Remove handler `mapError` wrappers. Convert `SkillsError`, `DiscoveryError` to `CliError`. Delete remaining domain errors.
10. **Runtime**: Constrain `run` to `CliError | PromptCancelled`. Type `classifyError` properly. Remove duck-typing.
11. **Cleanup**: Delete empty error files, remove stale barrel exports, remove unused error union types.

## Risks / Trade-offs

**`catchAll` is less precise than `catchTag`** → Mitigated by scoping `catchAll` to sub-expressions with narrow error channels. A `catchAll` on `createSymlink()` only catches symlink errors because that's all the sub-expression can produce. Document this pattern clearly for contributors.

**CliError leaks into low-level modules** → Acceptable. `makeCliError` is a pure factory function with no dependencies. It's equivalent to `new Error(...)` but with structured fields. Low-level modules gain the ability to produce specific, actionable error messages.

**Error codes are strings, not a union type** → Codes are validated in tests, not at the type level. A union type would create a central registry that every module imports — the "cross-feature constants file" anti-pattern. String codes are greppable and sufficient.

**Service contracts become less specific** → Service methods return `CliError` instead of `SettingsError | LockfileError`. Since no caller discriminates on these types for recovery, this is purely a documentation loss. Error codes preserve the same information for testing and debugging.

**`readSettings` returning `Option` changes 3 call sites** → Two existing `catchTag("SettingsNotFoundError", ...)` patterns convert to `Option.getOrElse`/`Option.match`. The third call site (`ensureGlobalWorkspaceInitialized`) already uses `fs.exists` and doesn't rely on `SettingsNotFoundError`. The workspace layer already defaults to empty settings on not-found — the logic stays the same, just expressed differently.

**TUI services produce generic CliErrors** → TUI services don't know business context ("agent selection" vs "skill selection"). Their CliErrors are generic (`PROMPT_RENDER_FAILED`). Callers can enrich with `mapError` if needed. This is acceptable because prompt render failures are rare infrastructure errors, not common user-facing issues.

**Migration waves are larger than single modules** → Changing a module's error types forces updating its callers in the same wave. This is inherent to type-safe migration — you can't have `readSettings` return `Option<Settings>` while callers still `catchTag("SettingsNotFoundError", ...)`. Each wave is still testable and reviewable as a unit.

**Large migration surface (~25 error types, ~37 mapError calls, ~10+ test assertions, 5 service interfaces)** → Mitigated by wave-based approach. Each wave is independently testable and reviewable.
