## ADDED Requirements

### Requirement: TestRenderer captures all CliRenderer calls

The `TestRenderer` SHALL capture all `CliRenderer` method calls as structured data in a `TestRendererState` object. Tests SHALL assert on typed data, not formatted strings or ANSI escape codes.

#### Scenario: TestRenderer captures log calls

- **WHEN** code calls `renderer.info("Processing")` with the `TestRenderer` layer
- **THEN** `testRenderer.state.logs` SHALL contain `{ _tag: "info", message: "Processing" }`

#### Scenario: TestRenderer captures table calls

- **WHEN** code calls `renderer.table(items, columns, "Title")` with the `TestRenderer` layer
- **THEN** `testRenderer.state.tables` SHALL contain `{ items, columns, caption: "Title" }`

#### Scenario: TestRenderer captures detail calls

- **WHEN** code calls `renderer.detail(item, columns, "Title")` with the `TestRenderer` layer
- **THEN** `testRenderer.state.details` SHALL contain `{ item, columns, title: "Title" }`

#### Scenario: TestRenderer captures tree calls

- **WHEN** code calls `renderer.tree(roots, def, "Title")` with the `TestRenderer` layer
- **THEN** `testRenderer.state.trees` SHALL contain `{ roots, def, title: "Title" }`

#### Scenario: TestRenderer captures result calls

- **WHEN** code calls `renderer.result(data, schema)` with the `TestRenderer` layer
- **THEN** `testRenderer.state.results` SHALL contain `{ data, schema }`

#### Scenario: TestRenderer captures spinner messages

- **WHEN** code calls `renderer.withSpinner("Working...", f)` with the `TestRenderer` layer
- **THEN** `testRenderer.state.spinnerMessages` SHALL contain `"Working..."`

#### Scenario: TestRenderer captures note calls

- **WHEN** code calls `renderer.note("message", "title")` with the `TestRenderer` layer
- **THEN** `testRenderer.state.notes` SHALL contain `{ message: "message", title: "title" }`

### Requirement: TestRenderer result() returns false

The default `TestRenderer` SHALL return `false` from `result()` and `resultStream()`, simulating interactive mode behavior. This allows tests to exercise the full handler flow including data display calls.

#### Scenario: result() returns false in TestRenderer

- **WHEN** code calls `renderer.result(data, schema)` with the default `TestRenderer`
- **THEN** the method SHALL return `false`
- **AND** subsequent `table()`/`detail()`/`tree()` calls SHALL also be captured

### Requirement: TestMachineRenderer result() returns true

A `TestMachineRenderer` variant SHALL return `true` from `result()` and `resultStream()`, simulating machine mode behavior. Both variants capture all calls for assertion.

#### Scenario: result() returns true in TestMachineRenderer

- **WHEN** code calls `renderer.result(data, schema)` with the `TestMachineRenderer`
- **THEN** the method SHALL return `true`
- **AND** the call SHALL still be captured in `testRenderer.state.results`

### Requirement: TestRendererState structure

`TestRendererState` SHALL include: `logs` (array of `LogMessage`), `tables`, `details`, `trees`, `results`, `spinnerMessages`, `notes`, `boxes`, `cancelMessages`, `introTitle` (`Option<string>`), and `outroMessage` (`Option<string>`).

#### Scenario: Fresh TestRenderer has empty state

- **WHEN** `TestRenderer.make()` is called
- **THEN** all arrays in state SHALL be empty
- **AND** `introTitle` and `outroMessage` SHALL be `Option.none()`

### Requirement: TestPrompt with canned response queues

The `TestPrompt` SHALL accept preconfigured response queues (`textResponses`, `confirmResponses`, `selectResponses`, `multiselectResponses`). Each prompt call SHALL pop the next response from the appropriate queue. If the queue is empty, the prompt SHALL fail (indicating the handler asked for unexpected input).

#### Scenario: TestPrompt pops text response

- **WHEN** `TestPrompt.make({ textResponses: ["my-project"] })` is configured
- **AND** code calls `prompt.text({ message: "Name?" })`
- **THEN** the effect SHALL succeed with `"my-project"`

#### Scenario: TestPrompt pops confirm response

- **WHEN** `TestPrompt.make({ confirmResponses: [true, false] })` is configured
- **AND** code calls `prompt.confirm()` twice
- **THEN** the first call SHALL return `true` and the second SHALL return `false`

#### Scenario: TestPrompt fails on empty queue

- **WHEN** the response queue is empty
- **AND** code calls a prompt method
- **THEN** the effect SHALL fail with an error indicating unexpected prompt

### Requirement: TestPromptState records prompt calls

The `TestPrompt` SHALL record all prompt calls in a `TestPromptState` object with `textCalls`, `confirmCalls`, `selectCalls`, and `multiselectCalls` arrays, each containing the options passed to the prompt method.

#### Scenario: TestPromptState records text call options

- **WHEN** code calls `prompt.text({ message: "Name?", validate: fn })`
- **THEN** `testPrompt.state.textCalls` SHALL contain `{ message: "Name?", validate: fn }`

#### Scenario: TestPromptState records confirm call count

- **WHEN** code calls `prompt.confirm()` three times
- **THEN** `testPrompt.state.confirmCalls` SHALL have length 3

### Requirement: fromFlagOrPrompt helper

The `fromFlagOrPrompt(value, prompt)` helper SHALL return the `Option.some` value if present, otherwise call the prompt function. This formalizes the gather-then-execute pattern.

#### Scenario: Flag value present skips prompt

- **WHEN** `fromFlagOrPrompt(Option.some("value"), promptFn)` is called
- **THEN** the effect SHALL succeed with `"value"`
- **AND** `promptFn` SHALL NOT be called

#### Scenario: Flag value absent calls prompt

- **WHEN** `fromFlagOrPrompt(Option.none(), promptFn)` is called
- **THEN** `promptFn` SHALL be called
- **AND** the effect SHALL succeed with the prompt result

### Requirement: autoConfirm helper

The `autoConfirm(yes, prompt)` helper SHALL return `Effect.succeed(true)` if `yes` is `true`, otherwise call the prompt function. This keeps `--yes` handling explicit at the handler level.

#### Scenario: --yes flag skips confirmation

- **WHEN** `autoConfirm(true, promptFn)` is called
- **THEN** the effect SHALL succeed with `true`
- **AND** `promptFn` SHALL NOT be called

#### Scenario: No --yes flag calls confirmation prompt

- **WHEN** `autoConfirm(false, promptFn)` is called
- **THEN** `promptFn` SHALL be called
- **AND** the effect SHALL succeed with the prompt result
