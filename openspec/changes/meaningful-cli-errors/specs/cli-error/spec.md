## MODIFIED Requirements

### Requirement: CliError wrapper type

The system SHALL define a `CliError` tagged error as the single expected error type for all failures across the entire codebase. `CliError` SHALL be created at the point of failure by the code that has the best context for the error. `CliError` SHALL carry structured fields: `code` (string), `what` (string), `details` (ReadonlyArray<string>), `howToFix` (Option<string>), and `cause` (unknown). The `makeCliError` factory function SHALL be a pure function importable by any module.

#### Scenario: CliError constructed with all fields

- **WHEN** a handler creates a `CliError` with code `"INVALID_SOURCE"`, what `"Could not parse source"`, details `["Provided: foo"]`, howToFix `Some("Use github:owner/repo format")`, and cause from an original error
- **THEN** the `CliError` SHALL preserve all fields as provided
- **AND** the `_tag` SHALL be `"CliError"`

#### Scenario: CliError constructed with no recovery guidance

- **WHEN** a handler creates a `CliError` with howToFix as `None`
- **THEN** the error SHALL be valid and renderable without recovery guidance

#### Scenario: CliError constructed with empty details

- **WHEN** a handler creates a `CliError` with an empty details array
- **THEN** the error SHALL be valid and renderable without detail lines

#### Scenario: CliError created at the source, not at handler boundaries

- **WHEN** a low-level function (e.g., settings parser, git clone, source resolver) encounters a failure
- **THEN** that function SHALL create a `CliError` with specific `code`, `what`, `details`, and `howToFix`
- **AND** the error SHALL NOT be wrapped or re-created by an intermediate handler

### Requirement: Error codes

Each `CliError` SHALL carry a `code` string that is stable across versions for a given error condition. Error codes SHALL use `AREA_REASON` format where area is the module/feature and reason is the specific failure (e.g., `SETTINGS_PARSE_FAILED`, `SOURCE_CLONE_FAILED`, `LOCKFILE_WRITE_FAILED`). The error code SHALL be displayed in the rendered output.

#### Scenario: Error code appears in output

- **WHEN** a `CliError` with code `"SETTINGS_PARSE_FAILED"` is rendered
- **THEN** the code SHALL appear in the output alongside the what message

#### Scenario: Error codes are stable identifiers

- **WHEN** the same error condition occurs across different versions
- **THEN** the error code for that condition SHALL remain the same

#### Scenario: Error codes follow AREA_REASON naming

- **WHEN** a module creates a `CliError`
- **THEN** the `code` SHALL use uppercase `AREA_REASON` format (e.g., `GIT_CLONE_FAILED`, `REGISTRY_FETCH_FAILED`)

## ADDED Requirements

### Requirement: Runtime error channel constraint

The runtime `run` function SHALL constrain its error channel to `CliError | PromptCancelled`. The `run` function SHALL NOT accept arbitrary error types. Any effect passed to `run` with unmapped errors SHALL produce a TypeScript compilation error.

#### Scenario: Effect with CliError passes type check

- **WHEN** a handler returns `Effect<void, CliError | PromptCancelled, R>`
- **THEN** the effect SHALL be accepted by `run` without type errors

#### Scenario: Effect with unmapped domain error fails type check

- **WHEN** a handler returns an effect with a domain error type not assignable to `CliError | PromptCancelled`
- **THEN** TypeScript SHALL produce a compilation error

#### Scenario: classifyError uses typed pattern matching

- **WHEN** `classifyError` receives a `CliError | PromptCancelled` value
- **THEN** it SHALL use `_tag` pattern matching (not duck-typing) to classify the error

### Requirement: No domain error types

The system SHALL NOT define domain-specific error types (e.g., `SettingsParseError`, `SourceError`, `GitError`). All expected failures SHALL use `CliError` directly. Domain error union types (e.g., `SettingsError`, `LockfileError`, `WorkspaceContextError`) SHALL NOT exist.

#### Scenario: Domain error type is not defined

- **WHEN** a module needs to represent a failure
- **THEN** it SHALL create a `CliError` with an appropriate `code`, not a domain-specific tagged error

#### Scenario: Domain error unions do not exist

- **WHEN** service interfaces define method signatures
- **THEN** error channels SHALL use `CliError` (or `CliError | PromptCancelled`), not domain error union types

### Requirement: Service interfaces use CliError

Service method signatures SHALL use `CliError` as their error type instead of domain error types. `WorkspaceContextService`, `SourceProvidersService`, and TUI services SHALL return effects with `CliError` (or `CliError | PromptCancelled` for prompt-bearing methods) in their error channels.

#### Scenario: WorkspaceContextService methods return CliError

- **WHEN** a `WorkspaceContextService` method (e.g., `getLockedSkills`, `getConfiguredSources`) fails
- **THEN** the error channel SHALL contain `CliError`, not `LockfileError` or `SettingsError`

#### Scenario: TUI services return CliError for failures

- **WHEN** a TUI service prompt fails (not cancelled)
- **THEN** the error channel SHALL contain `CliError` with code `PROMPT_RENDER_FAILED`
- **AND** howToFix SHALL suggest `"Run with --yes to skip prompts, or ensure stdin is a terminal"`

#### Scenario: PromptCancelled remains distinct from CliError

- **WHEN** a user cancels a prompt
- **THEN** the error SHALL be `PromptCancelled`, not `CliError`
- **AND** the runtime SHALL handle it as exit code 0

### Requirement: Option-based not-found control flow

Functions that look up optional resources SHALL return `Option<T>` instead of failing with a not-found error. Callers SHALL use `Option.getOrElse` or `Option.match` to handle the missing case.

#### Scenario: readSettings returns Option for missing file

- **WHEN** `readSettings` is called and the settings file does not exist
- **THEN** the function SHALL return `Effect<Option<Settings>, CliError>`
- **AND** the Option SHALL be `None`

#### Scenario: Caller provides default for missing settings

- **WHEN** a caller receives `None` from `readSettings`
- **THEN** the caller SHALL use `Option.getOrElse` to provide default settings

### Requirement: Scoped catchAll for recovery patterns

Recovery patterns SHALL use `Effect.catchAll` on scoped sub-expressions instead of `catchTag` with domain error types. This is safe because the sub-expression's error channel is already narrow.

#### Scenario: Symlink fallback uses scoped catchAll

- **WHEN** a symlink operation fails
- **THEN** the caller SHALL use `Effect.catchAll` on the symlink sub-expression to fall back to directory copy

#### Scenario: Operation error recovery uses scoped catchAll

- **WHEN** an operation handler fails during plan execution
- **THEN** `applyStep` SHALL use `Effect.catchAll` on the handler sub-expression to convert to an error result

## REMOVED Requirements

### Requirement: Handler error conversion

**Reason**: Handlers no longer convert domain errors to CliError. Errors arrive as CliError from the source, so handler-level mapError wrappers are unnecessary.
**Migration**: Remove mapError wrappers from handlers. Ensure all service and utility functions create CliError directly.

### Requirement: Domain error cause standardization

**Reason**: All domain error types are being deleted. The standardization of `cause: unknown` on domain errors is no longer relevant.
**Migration**: CliError already uses `cause: unknown`. No action needed.
