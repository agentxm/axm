## ADDED Requirements

### Requirement: Activity service provides spinner (indeterminate progress)

The `Activity` service SHALL be defined at `src/activity/activity.ts` as an Effect service. It SHALL provide `startSpinner(message?)` returning `Effect<SpinnerHandle>` and `withSpinner(message, f, options?)` returning `Effect<A, E, R>`. `SpinnerHandle` SHALL provide `stop(message?)`, `message(message?)`, `cancel(message?)`, `error(message?)`, and `clear()`, each returning `Effect<void>`. These methods SHALL have 1:1 behavioral parity with the former `ClackSpinner` methods they replace.

#### Scenario: Start and stop spinner

- **WHEN** a handler calls `activity.startSpinner("Installing skills...")`
- **THEN** a spinner SHALL render in the terminal with that message
- **WHEN** the handler calls `handle.stop("Done")`
- **THEN** the spinner SHALL stop and display completion output

#### Scenario: withSpinner wraps async work

- **WHEN** a handler calls `activity.withSpinner("Parsing...", () => parseSource(), { successMessage: "Parsed" })`
- **THEN** a spinner SHALL render during execution
- **AND** on success, the spinner SHALL stop with the success message
- **AND** the effect SHALL succeed with the return value of `parseSource()`

#### Scenario: withSpinner with dynamic success message

- **WHEN** options includes `successMessage` as a function `(value: A) => string`
- **AND** the inner effect succeeds with value `a`
- **THEN** the spinner SHALL stop with the result of `successMessage(a)`

#### Scenario: withSpinner handles failure

- **WHEN** the inner effect fails
- **THEN** the spinner SHALL be finalized with error state before the failure propagates
- **AND** if `failureMessage` is provided, it SHALL be used as the error display

#### Scenario: withSpinner handles interruption

- **WHEN** the inner effect is interrupted
- **THEN** the spinner SHALL be finalized with cancel state

#### Scenario: Spinner handle message update

- **WHEN** a handler calls `handle.message("Step 2 of 3...")` during spinner execution
- **THEN** the spinner display SHALL update to show the new message

### Requirement: Activity service provides progress (determinate progress)

The `Activity` service SHALL provide `startProgress(config, message?)` returning `Effect<ProgressHandle>` and `withProgress(config, message, f, stopMessage?)` returning `Effect<A, E, R>`. `ProgressConfig` SHALL accept `max?`, `style?` (`"light" | "heavy" | "block"`), and `size?`. `ProgressHandle` SHALL extend `SpinnerHandle` with an additional `advance(step?, message?)` method.

#### Scenario: Progress bar with advance

- **WHEN** a handler calls `activity.withProgress({ max: 10 }, "Installing...", (h) => ...)`
- **AND** the inner function calls `h.advance(1, "File 1")`
- **THEN** the progress bar SHALL advance by one step and display the message

#### Scenario: Progress bar completion

- **WHEN** the inner effect completes successfully
- **THEN** the progress bar SHALL stop with the `stopMessage` if provided, or the original message

#### Scenario: Start progress for manual control

- **WHEN** a handler calls `activity.startProgress({ max: 5 }, "Working...")`
- **THEN** a `ProgressHandle` SHALL be returned for manual lifecycle management

### Requirement: Activity service provides task log (grouped hierarchical output)

The `Activity` service SHALL provide `startTaskLog(config)` returning `Effect<TaskLogHandle>` and `withTaskLog(config, f)` returning `Effect<A, E, R>`. `TaskLogConfig` SHALL accept `title`, optional `limit`, and optional `retainLog`. `TaskLogHandle` SHALL provide `message(msg)`, `group(name)` returning `Effect<TaskLogGroupHandle>`, `error(message)`, and `success(message)`. `TaskLogGroupHandle` SHALL provide `message(msg)`, `error(message)`, and `success(message)`.

#### Scenario: Task log with groups

- **WHEN** a handler calls `activity.withTaskLog({ title: "Build" }, (log) => ...)`
- **AND** the inner function calls `log.group("TypeScript")` then `group.success("OK")`
- **THEN** the task log SHALL render the group heading and success status

#### Scenario: Task log message

- **WHEN** a handler calls `log.message("Processing files...")`
- **THEN** the task log SHALL display the message under the current context

#### Scenario: Start task log for manual control

- **WHEN** a handler calls `activity.startTaskLog({ title: "Deploy", retainLog: true })`
- **THEN** a `TaskLogHandle` SHALL be returned for manual lifecycle management

### Requirement: Activity service provides sequential task runner

The `Activity` service SHALL provide `runTasks(tasks)` accepting `ReadonlyArray<Task<E, R>>`. Each `Task` SHALL have `title: string`, `task: (message: (msg: string) => Effect<void>) => Effect<string | void, E, R>`, and optional `enabled?: boolean`. Tasks SHALL execute sequentially. Disabled tasks (`enabled: false`) SHALL be skipped.

#### Scenario: Run multiple tasks sequentially

- **WHEN** a handler calls `activity.runTasks([task1, task2])`
- **THEN** task1 SHALL complete before task2 starts
- **AND** each task SHALL display a spinner with its title

#### Scenario: Task returns custom success message

- **WHEN** a task's `task` function returns a string `"3 files processed"`
- **THEN** the spinner SHALL stop with that string as the success message

#### Scenario: Task returns void

- **WHEN** a task's `task` function returns void
- **THEN** the spinner SHALL stop with the task's `title` as the success message

#### Scenario: Disabled task is skipped

- **WHEN** a task has `enabled: false`
- **THEN** it SHALL NOT execute and no spinner SHALL appear for it

#### Scenario: Task message callback updates spinner

- **WHEN** a task calls its `message` callback with `"Resolving versions..."`
- **THEN** the spinner message SHALL update to that text

### Requirement: Activity service has structured output layers

The `Activity` service SHALL have a structured layer factory `ActivityStructured(mode)` where mode is `"json" | "stream-json"`. In json mode, all handles SHALL be no-ops (no output). In stream-json mode, spinner and progress operations SHALL emit NDJSON progress events.

#### Scenario: Structured spinner in stream-json mode

- **WHEN** `withSpinner("Working...", f)` runs in stream-json mode
- **THEN** stdout SHALL receive `{"type":"progress","phase":"work","percent":0,"message":"Working..."}`
- **AND** on completion, `{"type":"progress","phase":"work","percent":100,"message":"Done"}`

#### Scenario: Structured progress in stream-json mode

- **WHEN** `withProgress({ max: 10 }, "Installing...", f)` runs and `advance(3)` is called
- **THEN** stdout SHALL receive progress events with `percent: 30`

#### Scenario: Structured spinner in json mode

- **WHEN** `withSpinner("Working...", f)` runs in json mode
- **THEN** no output SHALL be produced (no-op handle)
- **AND** the inner effect SHALL still execute normally

#### Scenario: Structured task log in stream-json mode

- **WHEN** `startTaskLog` is called in stream-json mode
- **THEN** messages SHALL emit as NDJSON log events prefixed with the task log title

### Requirement: Activity service is injectable and testable

The `Activity` service SHALL expose a test layer factory `makeActivityTestLayer(overrides?)` returning `[Layer, MockActivityService]`. The default mock SHALL execute inner effects (pass-through) with no-op handles. Overrides SHALL allow customizing individual methods.

#### Scenario: Mock executes withSpinner work

- **WHEN** code calls `activity.withSpinner("msg", () => Effect.succeed(42))` with the test layer
- **THEN** the effect SHALL succeed with `42` without rendering UI

#### Scenario: Mock records activity calls

- **WHEN** code calls `activity.withSpinner("msg", f)` with the test layer
- **THEN** the mock SHALL record the call with method name and message

### Requirement: Activity live layer imports @clack/prompts directly

The `ActivityLive` layer at `src/activity/activity-live.ts` SHALL import `@clack/prompts` directly. No intermediate `clack-effect/` module SHALL exist between the Activity service and Clack.

#### Scenario: No clack-effect dependency

- **WHEN** the `src/activity/` module is inspected
- **THEN** it SHALL NOT import from `clack-effect/`
- **AND** it SHALL import `@clack/prompts` in `activity-live.ts` only
