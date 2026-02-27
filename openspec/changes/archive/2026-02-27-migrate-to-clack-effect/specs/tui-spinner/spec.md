## MODIFIED Requirements

### Requirement: Spinner service provides animated progress indicator

The Spinner capability SHALL be provided by `ClackSpinner` under `src/clack-effect/spinner/` with an Effect service tag, live layer, types (`ClackSpinnerHandle`), and test layer factory. It SHALL provide `start(message?)` returning `Effect<ClackSpinnerHandle>`. `ClackSpinnerHandle` SHALL provide `stop(message?)`, `message(message)`, `cancel(message?)`, `error(message?)`, and `clear()`. Handlers that start a spinner SHALL finalize it through `stop/cancel/error` on all success and failure paths, or use `withSpinner`.

#### Scenario: Start and stop spinner

- **WHEN** a handler calls `spinner.start("Installing skills...")`
- **THEN** a spinner SHALL render in the terminal with that message
- **WHEN** the handler calls `handle.stop("Done")`
- **THEN** the spinner SHALL stop and display completion output

#### Scenario: Spinner failure path is finalized

- **WHEN** a handler starts a spinner and a later effect fails
- **THEN** the spinner SHALL be finalized before control returns to runtime error rendering
- **AND** the final spinner state SHALL indicate cancellation or error

#### Scenario: Spinner test layer records calls

- **WHEN** code uses `makeClackSpinnerTestLayer()` and starts/stops a spinner
- **THEN** the mock service SHALL record spinner method calls for assertion

#### Scenario: Handler depends only on ClackSpinner

- **WHEN** a handler uses only spinner behavior
- **THEN** its Effect type signature SHALL require only `ClackSpinner`

### Requirement: Dev demo for spinner

The dev command at `src/dev-cli-commands/tui/spinner/command.ts` SHALL provide a spinner demo backed by `ClackSpinner` and `ClackLive`.

#### Scenario: Run spinner demo

- **WHEN** a developer runs the dev CLI spinner demo command
- **THEN** the command SHALL start a spinner, wait briefly, and stop with a completion message
