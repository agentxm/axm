## MODIFIED Requirements

### Requirement: Password input collects masked text

The password-input capability SHALL be provided by `Input.password` from `src/input/`. It SHALL accept `message` with optional `mask` and optional `validate`, and return `Effect<string, AppError | PromptCancelled>`.

#### Scenario: Basic password input

- **WHEN** a handler calls `input.password({ message: "Enter token:" })`
- **AND** the user types `abc123`
- **THEN** terminal display SHALL show masked characters
- **WHEN** the user submits
- **THEN** the effect SHALL succeed with `"abc123"`

#### Scenario: Custom mask character

- **WHEN** a handler calls `input.password({ message: "Token:", mask: "*" })`
- **AND** the user types characters
- **THEN** the displayed characters SHALL use the configured mask

#### Scenario: Password input cancelled

- **WHEN** the user presses Escape or Ctrl+C during password input
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Password input has a test layer

Password-input tests SHALL use `makeInputTestLayer()` and assert `password` calls and configured outcomes.

#### Scenario: Mock returns configured value

- **WHEN** a test configures the input mock to return `"secret123"` for password
- **AND** code calls `input.password(...)`
- **THEN** the effect SHALL succeed with `"secret123"`

#### Scenario: Mock simulates cancellation

- **WHEN** a test configures the input mock to cancel
- **AND** code calls `input.password(...)`
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Dev demo for password input

The dev command at `src/dev-cli-commands/tui/password-input/command.ts` SHALL provide a password-input demo backed by `Input` and `InputLive`.

#### Scenario: Run password-input demo

- **WHEN** a developer runs the dev CLI password-input demo command
- **THEN** the command SHALL render a masked prompt and print the submitted value
