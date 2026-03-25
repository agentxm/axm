## Requirements

### Requirement: AppError wrapper type

The system SHALL define an `AppError` tagged error as the single expected error type for all failures across the entire codebase. `AppError` SHALL be created at the point of failure by the code that has the best context for the error. `AppError` SHALL carry structured fields: `code` (string), `what` (string), `details` (ReadonlyArray<string>), `howToFix` (Option<string>), and `cause` (unknown). The `makeAppError` factory function SHALL be a pure function importable by any module.

#### Scenario: AppError constructed with all fields

- **WHEN** a handler creates an `AppError` with code `"INVALID_SOURCE"`, what `"Could not parse source"`, details `["Provided: foo"]`, howToFix `Some("Use github:owner/repo format")`, and cause from an original error
- **THEN** the `AppError` SHALL preserve all fields as provided
- **AND** the `_tag` SHALL be `"AppError"`

#### Scenario: AppError constructed with no recovery guidance

- **WHEN** a handler creates an `AppError` with howToFix as `None`
- **THEN** the error SHALL be valid and renderable without recovery guidance

#### Scenario: AppError constructed with empty details

- **WHEN** a handler creates an `AppError` with an empty details array
- **THEN** the error SHALL be valid and renderable without detail lines

#### Scenario: AppError created at the source, not at handler boundaries

- **WHEN** a low-level function (e.g., settings parser, git clone, source resolver) encounters a failure
- **THEN** that function SHALL create an `AppError` with specific `code`, `what`, `details`, and `howToFix`
- **AND** the error SHALL NOT be wrapped or re-created by an intermediate handler

### Requirement: Error rendering

The system SHALL provide a `renderAppError` function that formats an `AppError` for terminal output. The output SHALL use the format: `✗ {what}` on the first line, each detail indented on subsequent lines, and howToFix indented on the final line (if present).

#### Scenario: Render error with all fields

- **WHEN** `renderAppError` is called with an `AppError` having what `"Could not resolve source"`, details `["Provided: invalid@#$%", "No matching extensions found"]`, howToFix `Some("Try: github:owner/repo")`
- **THEN** the output SHALL be:
  ```
  ✗ Could not resolve source (INVALID_SOURCE)
    Provided: invalid@#$%
    No matching extensions found
    Try: github:owner/repo
  ```

#### Scenario: Render error without recovery guidance

- **WHEN** `renderAppError` is called with an `AppError` having howToFix as `None`
- **THEN** the output SHALL omit the recovery line

#### Scenario: Render error with empty details

- **WHEN** `renderAppError` is called with an `AppError` having an empty details array
- **THEN** the output SHALL show only the what line (and howToFix if present)

### Requirement: Defect rendering

The system SHALL provide a `renderDefect` function that formats unexpected errors for terminal output. The output SHALL indicate the error is a bug, include the error's string representation, and suggest reporting the issue.

#### Scenario: Render a defect

- **WHEN** `renderDefect` is called with an untyped error object
- **THEN** the output SHALL include a message indicating this is an unexpected error
- **AND** SHALL include the error's message or string representation
- **AND** SHALL suggest reporting the issue

### Requirement: Error codes

Each `AppError` SHALL carry a `code` string that is stable across versions for a given error condition. Error codes SHALL use `AREA_REASON` format where area is the module/feature and reason is the specific failure (e.g., `SETTINGS_PARSE_FAILED`, `SOURCE_CLONE_FAILED`, `LOCKFILE_WRITE_FAILED`). The error code SHALL be displayed in the rendered output.

#### Scenario: Error code appears in output

- **WHEN** an `AppError` with code `"SETTINGS_PARSE_FAILED"` is rendered
- **THEN** the code SHALL appear in the output alongside the what message

#### Scenario: Error codes are stable identifiers

- **WHEN** the same error condition occurs across different versions
- **THEN** the error code for that condition SHALL remain the same

#### Scenario: Error codes follow AREA_REASON naming

- **WHEN** a module creates an `AppError`
- **THEN** the `code` SHALL use uppercase `AREA_REASON` format (e.g., `GIT_CLONE_FAILED`, `REGISTRY_FETCH_FAILED`)

### Requirement: Runtime error channel constraint

The runtime `run` function SHALL constrain its error channel to `AppError | PromptCancelled`. The `run` function SHALL NOT accept arbitrary error types. Any effect passed to `run` with unmapped errors SHALL produce a TypeScript compilation error.

#### Scenario: Effect with AppError passes type check

- **WHEN** a handler returns `Effect<void, AppError | PromptCancelled, R>`
- **THEN** the effect SHALL be accepted by `run` without type errors

#### Scenario: Effect with unmapped domain error fails type check

- **WHEN** a handler returns an effect with a domain error type not assignable to `AppError | PromptCancelled`
- **THEN** TypeScript SHALL produce a compilation error

#### Scenario: Error rendering reads verbosity from global flag settings

- **WHEN** an `AppError` is caught by the CLI error handler
- **THEN** the error handler SHALL read `verboseFlag` and `debugFlag` from the Effect CLI global flag settings in the fiber context
- **AND** SHALL pass them to `renderAppError` to control output detail level

### Requirement: No domain error types

The system SHALL NOT define domain-specific error types (e.g., `SettingsParseError`, `SourceError`, `GitError`). All expected failures SHALL use `AppError` directly. Domain error union types (e.g., `SettingsError`, `LockfileError`, `WorkspaceContextError`) SHALL NOT exist.

#### Scenario: Domain error type is not defined

- **WHEN** a module needs to represent a failure
- **THEN** it SHALL create an `AppError` with an appropriate `code`, not a domain-specific tagged error

#### Scenario: Domain error unions do not exist

- **WHEN** service interfaces define method signatures
- **THEN** error channels SHALL use `AppError` (or `AppError | PromptCancelled`), not domain error union types

### Requirement: Service interfaces use AppError

Service method signatures SHALL use `AppError` as their error type instead of domain error types. `WorkspaceContextService`, `SourceProvidersService`, and TUI services SHALL return effects with `AppError` (or `AppError | PromptCancelled` for prompt-bearing methods) in their error channels.

#### Scenario: WorkspaceContextService methods return AppError

- **WHEN** a `WorkspaceContextService` method (e.g., `getLockedSkills`, `getConfiguredSources`) fails
- **THEN** the error channel SHALL contain `AppError`, not `LockfileError` or `SettingsError`

#### Scenario: TUI services return AppError for failures

- **WHEN** a TUI service prompt fails (not cancelled)
- **THEN** the error channel SHALL contain `AppError` with code `PROMPT_RENDER_FAILED`
- **AND** howToFix SHALL suggest `"Run with --yes to skip prompts, or ensure stdin is a terminal"`

#### Scenario: PromptCancelled remains distinct from AppError

- **WHEN** a user cancels a prompt
- **THEN** the error SHALL be `PromptCancelled`, not `AppError`
- **AND** the runtime SHALL handle it as exit code 0

### Requirement: Option-based not-found control flow

Functions that look up optional resources SHALL return `Option<T>` instead of failing with a not-found error. Callers SHALL use `Option.getOrElse` or `Option.match` to handle the missing case.

#### Scenario: readSettings returns Option for missing file

- **WHEN** `readSettings` is called and the settings file does not exist
- **THEN** the function SHALL return `Effect<Option<Settings>, AppError>`
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
