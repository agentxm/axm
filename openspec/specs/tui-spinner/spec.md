## Requirements

### Requirement: Spinner service provides animated progress indicator

The Spinner service SHALL be a self-contained module under `src/tui/spinner/` with its own Effect service tag, live layer, types (`SpinnerHandle`), Ink component, and test layer factory. It SHALL provide a `start` method that accepts a message string and returns `Effect<SpinnerHandle>`. The `SpinnerHandle` SHALL provide `stop(message: string)` to halt the spinner and display a completion message.

#### Scenario: Start and stop spinner

- **WHEN** a handler calls `spinner.start("Installing skills...")`
- **THEN** an animated spinner SHALL render in the terminal with the message "Installing skills..."
- **WHEN** the handler then calls `handle.stop("Done")`
- **THEN** the spinner animation SHALL stop and "Done" SHALL be displayed

#### Scenario: Spinner test layer records calls

- **WHEN** a handler starts and stops a spinner using the test layer
- **THEN** the mock service SHALL record the start and stop messages for assertion

#### Scenario: Handler depends only on Spinner

- **WHEN** a handler uses only the Spinner service
- **THEN** its Effect type signature SHALL require only `Spinner` — not all TUI services

### Requirement: Dev demo for spinner

The dev entry point at `src/dev/tui.ts` SHALL include a `spinner` sub-command for manually testing the spinner.

#### Scenario: Run spinner demo

- **WHEN** a developer runs `pnpm tui spinner`
- **THEN** the dev entry point SHALL start a spinner, wait briefly, then stop it with a completion message
