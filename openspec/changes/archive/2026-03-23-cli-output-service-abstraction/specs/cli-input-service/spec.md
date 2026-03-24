## ADDED Requirements

### Requirement: Input service provides interactive prompts

The `Input` service SHALL be defined at `src/input/input.ts` as an Effect service. It SHALL provide methods `text`, `password`, `confirm`, `select`, `multiselect`, `groupMultiselect`, `selectKey`, `autocomplete`, `autocompleteMultiselect`, and `path`. All methods SHALL return `Effect<T, CliError | PromptCancelled>`. These methods SHALL have 1:1 behavioral parity with the former `ClackPrompt` methods they replace.

#### Scenario: Text input

- **WHEN** a handler calls `input.text({ message: "Project name?" })`
- **AND** the user types `my-project` and submits
- **THEN** the effect SHALL succeed with `"my-project"`

#### Scenario: Password input

- **WHEN** a handler calls `input.password({ message: "Token:", mask: "*" })`
- **AND** the user types characters
- **THEN** the display SHALL show masked characters
- **AND** the effect SHALL succeed with the actual typed value

#### Scenario: Confirm prompt

- **WHEN** a handler calls `input.confirm({ message: "Continue?" })`
- **AND** the user accepts
- **THEN** the effect SHALL succeed with `true`

#### Scenario: Select prompt

- **WHEN** a handler calls `input.select({ message: "Template?", options })`
- **AND** the user selects an option
- **THEN** the effect SHALL succeed with that option's `value`

#### Scenario: Multiselect prompt

- **WHEN** a handler calls `input.multiselect({ message: "Skills?", options })`
- **AND** the user selects two options and submits
- **THEN** the effect SHALL succeed with an array of the selected option values

#### Scenario: Group multiselect prompt

- **WHEN** a handler calls `input.groupMultiselect({ message: "Extensions?", options: { "Skills": [...], "Commands": [...] } })`
- **AND** the user selects options from multiple groups
- **THEN** the effect SHALL succeed with an array of all selected values

#### Scenario: Select key prompt

- **WHEN** a handler calls `input.selectKey({ message: "Action?", options })`
- **AND** the user presses the key corresponding to an option
- **THEN** the effect SHALL succeed with that option's value

#### Scenario: Autocomplete prompt

- **WHEN** a handler calls `input.autocomplete({ message: "Search skills", options })`
- **AND** the user types to filter and selects an option
- **THEN** the effect SHALL succeed with that option's value

#### Scenario: Autocomplete multiselect prompt

- **WHEN** a handler calls `input.autocompleteMultiselect({ message: "Search", options })`
- **AND** the user searches, selects multiple options, and submits
- **THEN** the effect SHALL succeed with an array of selected values

#### Scenario: Path input

- **WHEN** a handler calls `input.path({ message: "Directory?", directory: true })`
- **AND** the user navigates and selects a path
- **THEN** the effect SHALL succeed with the selected path string

### Requirement: Input prompts support cancellation

All `Input` methods SHALL fail with `PromptCancelled` when the user presses Escape or Ctrl+C. `PromptCancelled` SHALL remain a distinct control-flow signal (exit 0), not a `CliError`.

#### Scenario: Any prompt cancelled

- **WHEN** the user presses Escape or Ctrl+C during any prompt
- **THEN** the effect SHALL fail with `PromptCancelled`
- **AND** `PromptCancelled` SHALL NOT be treated as an error (exit code 0)

### Requirement: Input prompts support validation

The `text`, `password`, `autocomplete`, `autocompleteMultiselect`, and `path` methods SHALL accept an optional `validate` function. When validation returns an error string, the prompt SHALL remain active and display the feedback. When validation returns `undefined`, the input SHALL be accepted.

#### Scenario: Text input with validation failure

- **WHEN** `validate` returns `"Name must start with @"` for the current input
- **THEN** the prompt SHALL display the validation message and remain active

#### Scenario: Text input with validation success

- **WHEN** `validate` returns `undefined` for the current input
- **THEN** the input SHALL be accepted and the effect SHALL succeed

### Requirement: Input service guards against non-interactive mode

The `InputLive` layer SHALL depend on `CliFlags`. When `nonInteractive` is true, all prompt methods SHALL fail with a `CliError` (code `PROMPT_IN_NON_INTERACTIVE`) instead of rendering UI. The error message SHALL indicate that the handler should bypass the prompt when `--non-interactive` is set.

#### Scenario: Prompt in non-interactive mode

- **WHEN** `CliFlags.nonInteractive` is true
- **AND** a handler calls any `Input` method
- **THEN** the effect SHALL fail with `CliError` code `PROMPT_IN_NON_INTERACTIVE`

### Requirement: Input service has structured output layer

The `Input` service SHALL have a structured layer `InputStructured`. In structured output modes (`json` or `stream-json`), all prompt methods SHALL fail with `CliError` code `PROMPT_IN_STRUCTURED_OUTPUT`. The error message SHALL suggest passing the equivalent flag to provide the value non-interactively.

#### Scenario: Prompt in structured output mode

- **WHEN** output format is `json` or `stream-json`
- **AND** a handler calls `input.confirm({ message: "Continue?" })`
- **THEN** the effect SHALL fail with `CliError` code `PROMPT_IN_STRUCTURED_OUTPUT`
- **AND** the error `howToFix` SHALL suggest the equivalent flag alternative

### Requirement: Input config types are owned, not Clack types

All config types (`TextConfig`, `PasswordConfig`, `ConfirmConfig`, `SelectConfig`, `MultiselectConfig`, `GroupMultiselectConfig`, `SelectKeyConfig`, `AutocompleteConfig`, `AutocompleteMultiselectConfig`, `PathConfig`) and the `InputOption<V>` type SHALL be defined in `src/input/input.ts`. No Clack types SHALL appear in handler signatures.

#### Scenario: Handler uses only Input types

- **WHEN** a handler imports config types for Input prompts
- **THEN** those types SHALL come from `src/input/` not from `clack-effect/` or `@clack/prompts`

### Requirement: Input service replaces legacy prompt wrappers

The legacy prompt services (`Confirm`, `Select`, `Multiselect`, `TextInput`, `PasswordInput`) from `clack-effect/legacy-prompt.ts` SHALL be removed. Handlers SHALL use `Input` methods directly. The `toOption` mapper pattern SHALL be replaced by inline `.map()` at call sites.

#### Scenario: Legacy Multiselect replaced by Input.multiselect

- **WHEN** a handler previously called `multiselect.prompt({ items, toOption })`
- **THEN** it SHALL call `input.multiselect({ options: items.map(...) })` instead

#### Scenario: Legacy Confirm replaced by Input.confirm

- **WHEN** a handler previously called `confirm.prompt({ message })`
- **THEN** it SHALL call `input.confirm({ message })` instead

### Requirement: Input service is injectable and testable

The `Input` service SHALL expose a test layer factory `makeInputTestLayer(overrides)` returning `[Layer, MockInputService]`. Overrides SHALL allow preconfiguring return values for each prompt method. The mock SHALL record all prompt calls for assertion.

#### Scenario: Mock returns configured confirm value

- **WHEN** a test configures `confirm: () => Effect.succeed(true)`
- **AND** code calls `input.confirm(...)`
- **THEN** the effect SHALL succeed with `true` without rendering UI

#### Scenario: Mock simulates cancellation

- **WHEN** a test configures `confirm: () => Effect.fail(new PromptCancelled(...))`
- **AND** code calls `input.confirm(...)`
- **THEN** the effect SHALL fail with `PromptCancelled`

#### Scenario: Mock records prompt calls

- **WHEN** code calls `input.text({ message: "Name?" })` with the test layer
- **THEN** the mock SHALL record the call with method name and config

### Requirement: Input live layer imports @clack/prompts directly

The `InputLive` layer at `src/input/input-live.ts` SHALL import `@clack/prompts` directly. No intermediate `clack-effect/` module SHALL exist between the Input service and Clack.

#### Scenario: No clack-effect dependency

- **WHEN** the `src/input/` module is inspected
- **THEN** it SHALL NOT import from `clack-effect/`
- **AND** it SHALL import `@clack/prompts` in `input-live.ts` only
