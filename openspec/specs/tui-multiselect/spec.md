## MODIFIED Requirements

### Requirement: Multiselect prompt collects multiple selections from a list

The multiselect capability SHALL be provided by `Input.multiselect` from `src/input/`. It SHALL accept `message`, `options: ReadonlyArray<InputOption<V>>`, optional `initialValues`, and optional `required`, and return `Effect<ReadonlyArray<V>, AppError | PromptCancelled>`.

#### Scenario: Basic multiselect

- **WHEN** a handler calls `input.multiselect({ message: "Skills?", options })`
- **THEN** the prompt SHALL render with toggleable selections
- **WHEN** the user selects two options and submits
- **THEN** the effect SHALL succeed with an array of the selected option `value` entries

#### Scenario: Multiselect with initial values

- **WHEN** `initialValues` includes values present in `options`
- **THEN** those options SHALL be pre-selected

#### Scenario: Multiselect with required flag

- **WHEN** `required` is true and the user submits with no selection
- **THEN** submission SHALL be prevented until at least one option is selected

#### Scenario: Multiselect cancelled

- **WHEN** the user presses Escape or Ctrl+C during multiselect
- **THEN** the effect SHALL fail with `PromptCancelled`
