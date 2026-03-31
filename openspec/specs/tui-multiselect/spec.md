## MODIFIED Requirements

### Requirement: Multiselect prompt collects multiple selections from a list

The multiselect prompt SHALL let the user choose multiple options from a list. It SHALL display a required message and MAY pre-select values or require at least one selection.

#### Scenario: Basic multiselect

- **WHEN** a handler calls `input.multiselect({ message: "Skills?", options })`
- **THEN** the prompt SHALL render with toggleable selections
- **WHEN** the user selects two options and submits
- **THEN** the prompt SHALL return the selected option values

#### Scenario: Multiselect with initial values

- **WHEN** `initialValues` includes values present in `options`
- **THEN** those options SHALL be pre-selected

#### Scenario: Multiselect with required flag

- **WHEN** `required` is true and the user submits with no selection
- **THEN** submission SHALL be prevented until at least one option is selected

#### Scenario: Multiselect cancelled

- **WHEN** the user presses Escape or Ctrl+C during multiselect
- **THEN** the prompt SHALL cancel cleanly
