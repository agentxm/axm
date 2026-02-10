## Requirements

### Requirement: Text input prompt collects free-form text

The TextInput service SHALL be a self-contained module under `src/tui/text-input/` with its own Effect service tag, live layer, types (`TextInputConfig`), Ink component, and test layer factory. It SHALL provide a `prompt` method that renders an interactive text input. It accepts a config with `message` (required), and optional `placeholder`, `defaultValue`, and `validate` function. It returns `Effect<string, PromptError | PromptCancelled>`.

#### Scenario: Basic text input

- **WHEN** a handler calls `textInput.prompt({ message: "Project name?" })`
- **THEN** the prompt SHALL render with the message "Project name?" and wait for user input
- **WHEN** the user types "my-project" and presses Enter
- **THEN** the effect SHALL succeed with the string "my-project"

#### Scenario: Text input with placeholder

- **WHEN** a handler calls `textInput.prompt({ message: "Name?", placeholder: "my-app" })`
- **THEN** the prompt SHALL display "my-app" as placeholder text when the input is empty

#### Scenario: Text input with default value

- **WHEN** a handler calls `textInput.prompt({ message: "Name?", defaultValue: "my-app" })`
- **THEN** the input SHALL be pre-filled with "my-app"
- **WHEN** the user presses Enter without modifying
- **THEN** the effect SHALL succeed with "my-app"

#### Scenario: Text input with validation

- **WHEN** a handler provides a `validate` function that returns an error message for empty strings
- **AND** the user submits an empty string
- **THEN** the validation error message SHALL be displayed and the prompt SHALL remain active
- **WHEN** the user then enters a valid value and submits
- **THEN** the effect SHALL succeed with that value

#### Scenario: Text input cancelled

- **WHEN** the user presses Escape or Ctrl+C during text input
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Text input has a test layer

The test layer factory SHALL return a `[Layer, MockTextInputService]` tuple. The mock SHALL support configurable behavior: return a value, or simulate cancellation.

#### Scenario: Mock returns configured value

- **WHEN** a test creates a text input test layer with `{ value: "my-project" }`
- **AND** a handler calls `textInput.prompt(...)`
- **THEN** the mock SHALL return "my-project" without rendering any UI

#### Scenario: Mock simulates cancellation

- **WHEN** a test creates a text input test layer with `{ type: "cancel" }`
- **AND** a handler calls `textInput.prompt(...)`
- **THEN** the mock SHALL fail with `PromptCancelled`

### Requirement: Dev demo for text input

The dev entry point at `src/dev/tui.ts` SHALL include a `text-input` sub-command for manually testing text input.

#### Scenario: Run text-input demo

- **WHEN** a developer runs `pnpm tui text-input`
- **THEN** the dev entry point SHALL render an interactive text input prompt and print the result
