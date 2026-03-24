## MODIFIED Requirements

### Requirement: Select prompt collects single selection from a list

The select capability SHALL be provided by `Input.select` from `src/input/`. It SHALL accept `message` and `options: ReadonlyArray<InputOption<V>>`, and return `Effect<V, CliError | PromptCancelled>`.

#### Scenario: Basic select

- **WHEN** a handler calls `input.select({ message: "Template?", options })`
- **THEN** the prompt SHALL render the message and a navigable option list
- **WHEN** the user selects the second option and presses Enter
- **THEN** the effect SHALL succeed with that option's `value`

#### Scenario: Select with hints

- **WHEN** an option includes `hint`
- **THEN** the hint text SHALL be displayed with the option label

#### Scenario: Select cancelled

- **WHEN** the user presses Escape or Ctrl+C during selection
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Select has a test layer

Select tests SHALL use `makeInputTestLayer()` and assert `select` calls and returned values.

#### Scenario: Mock returns selected value

- **WHEN** a test configures the input mock to return a specific value for select
- **AND** code calls `input.select(...)`
- **THEN** the effect SHALL succeed with that value without rendering UI

#### Scenario: Mock simulates cancellation

- **WHEN** a test configures the input mock to cancel
- **AND** code calls `input.select(...)`
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Dev demo for select

The dev command at `src/dev-cli-commands/tui/select/command.ts` SHALL provide a select demo backed by `Input` and `InputLive`.

#### Scenario: Run select demo

- **WHEN** a developer runs the dev CLI select demo command
- **THEN** the command SHALL render a select prompt with sample options and print the selected value
