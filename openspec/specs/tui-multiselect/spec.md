## MODIFIED Requirements

### Requirement: Multiselect prompt collects multiple selections from a list

The multiselect capability SHALL be provided by `ClackPrompt.multiselect` from `src/clack-effect/prompt/`. It SHALL accept `message`, `options: ReadonlyArray<ClackOption<V>>`, optional `initialValues`, and optional `required`, and return `Effect<ReadonlyArray<V>, AppError | PromptCancelled>`. Call sites that currently pass `items + toOption` and `Option`-wrapped config fields SHALL map to clack `options` and unwrap optional values before invoking the prompt.

#### Scenario: Basic multiselect

- **WHEN** a handler calls `prompt.multiselect({ message: "Skills?", options, ... })`
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

### Requirement: Multiselect has a test layer

Multiselect tests SHALL use `makeClackPromptTestLayer()` and assert `multiselect` calls and returned arrays.

#### Scenario: Mock returns selected values

- **WHEN** a test configures the clack prompt mock to return an array of selected values
- **AND** code calls `prompt.multiselect(...)`
- **THEN** the effect SHALL succeed with those values without rendering UI

#### Scenario: Mock simulates cancellation

- **WHEN** a test configures the clack prompt mock to cancel
- **AND** code calls `prompt.multiselect(...)`
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Dev demo for multiselect

The dev command at `src/dev-cli-commands/tui/multiselect/command.ts` SHALL provide a multiselect demo backed by `ClackPrompt` and `ClackLive`.

#### Scenario: Run multiselect demo

- **WHEN** a developer runs the dev CLI multiselect demo command
- **THEN** the command SHALL render a multiselect prompt with sample options and print selected values
