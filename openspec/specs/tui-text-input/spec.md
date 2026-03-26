## MODIFIED Requirements

### Requirement: Text input prompt collects free-form text

The text-input capability SHALL be provided by `Input.text` from `src/input/`. It SHALL accept `message` with optional `placeholder`, `defaultValue`/`initialValue`, and `validate`, and return `Effect<string, AppError | PromptCancelled>`.

#### Scenario: Basic text input

- **WHEN** a handler calls `input.text({ message: "Project name?" })`
- **THEN** the prompt SHALL render and wait for input
- **WHEN** the user types `my-project` and submits
- **THEN** the effect SHALL succeed with `"my-project"`

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
