## MODIFIED Requirements

### Requirement: Select prompt collects single selection from a list

The select prompt SHALL let the user choose one option from a list. It SHALL display a required message and a navigable list of options.

#### Scenario: Basic select

- **WHEN** a handler calls `input.select({ message: "Template?", options })`
- **THEN** the prompt SHALL render the message and a navigable option list
- **WHEN** the user selects the second option and presses Enter
- **THEN** the prompt SHALL return that option's value

#### Scenario: Select with hints

- **WHEN** an option includes `hint`
- **THEN** the hint text SHALL be displayed with the option label

#### Scenario: Select cancelled

- **WHEN** the user presses Escape or Ctrl+C during selection
- **THEN** the prompt SHALL cancel cleanly
