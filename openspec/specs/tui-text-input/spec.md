## MODIFIED Requirements

### Requirement: Text input prompt collects free-form text

The text input prompt SHALL collect free-form text from the user. It SHALL display a required message and MAY provide placeholder text, an initial value, or validation feedback.

#### Scenario: Basic text input

- **WHEN** a handler calls `input.text({ message: "Project name?" })`
- **THEN** the prompt SHALL render and wait for input
- **WHEN** the user types `my-project` and submits
- **THEN** the prompt SHALL return `"my-project"`

#### Scenario: Text input with placeholder and default

- **WHEN** a handler provides `placeholder` and a default/initial value
- **THEN** the prompt SHALL render those values in the input UI

#### Scenario: Text input with validation

- **WHEN** validation returns an error for invalid input
- **THEN** the prompt SHALL remain active and display validation feedback
- **WHEN** a valid input is submitted
- **THEN** the prompt SHALL return that value

#### Scenario: Text input cancelled

- **WHEN** the user presses Escape or Ctrl+C during text input
- **THEN** the prompt SHALL cancel cleanly
