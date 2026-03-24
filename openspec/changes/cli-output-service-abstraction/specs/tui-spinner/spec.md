## MODIFIED Requirements

### Requirement: Spinner service provides animated progress indicator

The Spinner capability SHALL be provided by the `Activity` service at `src/activity/`. It SHALL provide `startSpinner(message?)` returning `Effect<SpinnerHandle>` and `withSpinner(message, f, options?)`. `SpinnerHandle` SHALL provide `stop(message?)`, `message(message?)`, `cancel(message?)`, `error(message?)`, and `clear()`. Handlers that start a spinner SHALL finalize it through `stop/cancel/error` on all success and failure paths, or use `withSpinner`.

#### Scenario: Start and stop spinner

- **WHEN** a handler calls `activity.startSpinner("Installing skills...")`
- **THEN** a spinner SHALL render in the terminal with that message
- **WHEN** the handler calls `handle.stop("Done")`
- **THEN** the spinner SHALL stop and display completion output

#### Scenario: Spinner failure path is finalized

- **WHEN** a handler starts a spinner and a later effect fails
- **THEN** the spinner SHALL be finalized before control returns to runtime error rendering
- **AND** the final spinner state SHALL indicate cancellation or error

#### Scenario: Spinner test layer records calls

- **WHEN** code uses `makeActivityTestLayer()` and starts/stops a spinner
- **THEN** the mock service SHALL record spinner method calls for assertion

#### Scenario: Handler depends only on Activity

- **WHEN** a handler uses only spinner behavior
- **THEN** its Effect type signature SHALL require only `Activity`

### Requirement: Dev demo for spinner

The dev command at `src/dev-cli-commands/tui/spinner/command.ts` SHALL provide a spinner demo backed by `Activity` and `ActivityLive`.

#### Scenario: Run spinner demo

- **WHEN** a developer runs the dev CLI spinner demo command
- **THEN** the command SHALL start a spinner, wait briefly, and stop with a completion message
