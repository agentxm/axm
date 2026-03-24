## MODIFIED Requirements

### Requirement: Confirm prompt collects yes/no boolean

The confirm capability SHALL be provided by `Input.confirm` from `src/input/`. It SHALL accept a config with `message` (required) and optional `initialValue` and return `Effect<boolean, AppError | PromptCancelled>`.

#### Scenario: Confirm defaults to yes

- **WHEN** a handler calls `input.confirm({ message: "Continue?" })`
- **THEN** the prompt SHALL render with "Continue?" and default to yes
- **WHEN** the user presses Enter without changing the choice
- **THEN** the effect SHALL succeed with `true`

#### Scenario: Confirm with initial value false

- **WHEN** a handler calls `input.confirm({ message: "Delete?", initialValue: false })`
- **THEN** the default choice SHALL be no
- **WHEN** the user presses Enter
- **THEN** the effect SHALL succeed with `false`

#### Scenario: Confirm cancelled

- **WHEN** the user presses Escape or Ctrl+C during confirmation
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Confirm has a test layer

Confirm tests SHALL use `makeInputTestLayer()` and verify `confirm` method calls and configured outcomes.

#### Scenario: Mock returns configured value

- **WHEN** a test configures the input mock to return `true` for confirm
- **AND** code calls `input.confirm(...)`
- **THEN** the effect SHALL succeed with `true` without rendering UI

#### Scenario: Mock simulates cancellation

- **WHEN** a test configures the input mock to cancel
- **AND** code calls `input.confirm(...)`
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Dev demo for confirm

The dev command at `src/dev-cli-commands/tui/confirm/command.ts` SHALL provide a confirm demo backed by `Input` and `InputLive`.

#### Scenario: Run confirm demo

- **WHEN** a developer runs the dev CLI confirm demo command
- **THEN** the command SHALL render a confirm prompt and print the boolean result
