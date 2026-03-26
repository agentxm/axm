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
