## ADDED Requirements

### Requirement: Password input collects masked text

The PasswordInput service SHALL be a self-contained module under `src/tui/password-input/` with its own Effect service tag, live layer, types (`PasswordInputConfig`), Ink component, and test layer factory. It SHALL provide a `prompt` method that renders a masked text input. Characters SHALL be replaced with a mask character. It accepts a config with `message` (required) and optional `mask` character (defaults to `*`). It returns `Effect<string, PromptError | PromptCancelled>`.

#### Scenario: Basic password input

- **WHEN** a handler calls `passwordInput.prompt({ message: "Enter token:" })`
- **AND** the user types "abc123"
- **THEN** the display SHALL show "**\*\***" (masked characters)
- **WHEN** the user presses Enter
- **THEN** the effect SHALL succeed with the string "abc123"

#### Scenario: Custom mask character

- **WHEN** a handler calls `passwordInput.prompt({ message: "Token:", mask: "●" })`
- **AND** the user types "abc"
- **THEN** the display SHALL show "●●●"

#### Scenario: Password input cancelled

- **WHEN** the user presses Escape or Ctrl+C during password input
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Password input has a test layer

The test layer factory SHALL return a `[Layer, MockPasswordInputService]` tuple. The mock SHALL support configurable behavior: return a value, or simulate cancellation.

#### Scenario: Mock returns configured value

- **WHEN** a test creates a password input test layer with `{ value: "secret123" }`
- **AND** a handler calls `passwordInput.prompt(...)`
- **THEN** the mock SHALL return "secret123" without rendering any UI

#### Scenario: Mock simulates cancellation

- **WHEN** a test creates a password input test layer with `{ type: "cancel" }`
- **AND** a handler calls `passwordInput.prompt(...)`
- **THEN** the mock SHALL fail with `PromptCancelled`

### Requirement: Dev demo for password input

The dev entry point at `src/dev/tui.ts` SHALL include a `password-input` sub-command for manually testing password input.

#### Scenario: Run password-input demo

- **WHEN** a developer runs `pnpm tui password-input`
- **THEN** the dev entry point SHALL render a masked password prompt and print the result
