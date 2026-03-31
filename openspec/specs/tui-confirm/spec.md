## MODIFIED Requirements

### Requirement: Confirm prompt collects yes/no boolean

The confirm prompt SHALL collect a yes/no decision from the user. It SHALL display a required message and MAY provide an initial default choice.

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
- **THEN** the prompt SHALL cancel cleanly
