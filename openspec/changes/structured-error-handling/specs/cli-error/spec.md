## ADDED Requirements

### Requirement: CliError wrapper type

The system SHALL define a `CliError` tagged error as the single expected error type at the runtime boundary. `CliError` SHALL carry structured fields: `code` (string), `what` (string), `details` (ReadonlyArray<string>), `howToFix` (Option<string>), and `cause` (unknown).

#### Scenario: CliError constructed with all fields

- **WHEN** a handler creates a `CliError` with code `"INVALID_SOURCE"`, what `"Could not parse source"`, details `["Provided: foo"]`, howToFix `Some("Use github:owner/repo format")`, and cause from a domain error
- **THEN** the `CliError` SHALL preserve all fields as provided
- **AND** the `_tag` SHALL be `"CliError"`

#### Scenario: CliError constructed with no recovery guidance

- **WHEN** a handler creates a `CliError` with howToFix as `None`
- **THEN** the error SHALL be valid and renderable without recovery guidance

#### Scenario: CliError constructed with empty details

- **WHEN** a handler creates a `CliError` with an empty details array
- **THEN** the error SHALL be valid and renderable without detail lines

### Requirement: Error rendering

The system SHALL provide a `renderCliError` function that formats a `CliError` for terminal output. The output SHALL use the format: `✗ {what}` on the first line, each detail indented on subsequent lines, and howToFix indented on the final line (if present).

#### Scenario: Render error with all fields

- **WHEN** `renderCliError` is called with a `CliError` having what `"Could not resolve source"`, details `["Provided: invalid@#$%", "No matching extensions found"]`, howToFix `Some("Try: github:owner/repo")`
- **THEN** the output SHALL be:
  ```
  ✗ Could not resolve source (INVALID_SOURCE)
    Provided: invalid@#$%
    No matching extensions found
    Try: github:owner/repo
  ```

#### Scenario: Render error without recovery guidance

- **WHEN** `renderCliError` is called with a `CliError` having howToFix as `None`
- **THEN** the output SHALL omit the recovery line

#### Scenario: Render error with empty details

- **WHEN** `renderCliError` is called with a `CliError` having an empty details array
- **THEN** the output SHALL show only the what line (and howToFix if present)

### Requirement: Defect rendering

The system SHALL provide a `renderDefect` function that formats unexpected errors for terminal output. The output SHALL indicate the error is a bug, include the error's string representation, and suggest reporting the issue.

#### Scenario: Render a defect

- **WHEN** `renderDefect` is called with an untyped error object
- **THEN** the output SHALL include a message indicating this is an unexpected error
- **AND** SHALL include the error's message or string representation
- **AND** SHALL suggest reporting the issue

### Requirement: Error codes

Each `CliError` SHALL carry a `code` string that is stable across versions for a given error condition. Error codes SHALL be short uppercase identifiers (e.g., `WORKSPACE_NOT_INIT`, `INVALID_SOURCE`, `INSTALL_FAILED`). The error code SHALL be displayed in the rendered output.

#### Scenario: Error code appears in output

- **WHEN** a `CliError` with code `"WORKSPACE_NOT_INIT"` is rendered
- **THEN** the code SHALL appear in the output alongside the what message

#### Scenario: Error codes are stable identifiers

- **WHEN** the same error condition occurs across different versions
- **THEN** the error code for that condition SHALL remain the same

### Requirement: Handler error conversion

Every command handler SHALL convert its domain errors to `CliError` before they reach the runtime boundary. The handler SHALL use `Effect.mapError` or `Effect.catchAll` to wrap domain errors with appropriate code, what, details, and howToFix.

#### Scenario: Handler converts domain error to CliError

- **WHEN** a handler's domain operation fails with a domain-specific error (e.g., `WorkspaceNotInitializedError`)
- **THEN** the handler SHALL map it to a `CliError` with a meaningful code, what description, contextual details, and recovery guidance

#### Scenario: All handler errors are CliError at boundary

- **WHEN** a handler's Effect is provided to the runtime `run()` function
- **THEN** the Effect's error channel SHALL contain only `CliError | PromptCancelled`

### Requirement: Domain error cause standardization

All domain error classes SHALL use `cause: unknown` for their cause field. No domain error SHALL use `Option<unknown>` or optional `cause?` for the cause field.

#### Scenario: GitError uses cause unknown

- **WHEN** a `GitError` is created without an original cause
- **THEN** the `cause` field SHALL be `undefined` (not `Option.none()`)

#### Scenario: PromptError uses cause unknown

- **WHEN** a `PromptError` is created without an original cause
- **THEN** the `cause` field SHALL be `undefined` (not `Option.none()`)
