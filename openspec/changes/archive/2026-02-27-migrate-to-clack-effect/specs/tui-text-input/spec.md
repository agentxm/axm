## MODIFIED Requirements

### Requirement: Text input prompt collects free-form text

The text-input capability SHALL be provided by `ClackPrompt.text` from `src/clack-effect/prompt/`. It SHALL accept `message` with optional `placeholder`, `defaultValue`/`initialValue`, and `validate`, and return `Effect<string, CliError | PromptCancelled>`.

#### Scenario: Basic text input

- **WHEN** a handler calls `prompt.text({ message: "Project name?" })`
- **THEN** the prompt SHALL render and wait for input
- **WHEN** the user types `my-project` and submits
- **THEN** the effect SHALL succeed with `my-project`

#### Scenario: Text input with placeholder and default

- **WHEN** a handler provides `placeholder` and a default/initial value
- **THEN** the prompt SHALL render those values in the input UI

#### Scenario: Text input with validation

- **WHEN** validation returns an error for invalid input
- **THEN** the prompt SHALL remain active and display validation feedback
- **WHEN** a valid input is submitted
- **THEN** the effect SHALL succeed with that value

#### Scenario: Text input cancelled

- **WHEN** the user presses Escape or Ctrl+C during text input
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Text input has a test layer

Text-input tests SHALL use `makeClackPromptTestLayer()` and assert `text` calls and configured outcomes.

#### Scenario: Mock returns configured value

- **WHEN** a test configures the clack prompt mock to return `my-project`
- **AND** code calls `prompt.text(...)`
- **THEN** the effect SHALL succeed with `my-project`

#### Scenario: Mock simulates cancellation

- **WHEN** a test configures the clack prompt mock to cancel
- **AND** code calls `prompt.text(...)`
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Dev demo for text input

The dev command at `src/dev-cli-commands/tui/text-input/command.ts` SHALL provide a text-input demo backed by `ClackPrompt` and `ClackLive`.

#### Scenario: Run text-input demo

- **WHEN** a developer runs the dev CLI text-input demo command
- **THEN** the command SHALL render a text input prompt and print the result
