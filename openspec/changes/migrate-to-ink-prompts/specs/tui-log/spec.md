## ADDED Requirements

### Requirement: Log service provides semantic log output

The Log service SHALL provide methods for writing semantic log messages to stdout: `info`, `warn`, `error`, `success`, and `message`. Each method accepts a string message and returns `Effect<void>`.

#### Scenario: Info message

- **WHEN** a handler calls `log.info("Processing 3 skills")`
- **THEN** the message "Processing 3 skills" SHALL be written to stdout with info-level formatting

#### Scenario: Warning message

- **WHEN** a handler calls `log.warn("Skill already installed")`
- **THEN** the message "Skill already installed" SHALL be written to stdout with warning-level formatting

#### Scenario: Error message

- **WHEN** a handler calls `log.error("Failed to resolve source")`
- **THEN** the message "Failed to resolve source" SHALL be written to stdout with error-level formatting

#### Scenario: Success message

- **WHEN** a handler calls `log.success("Installation complete")`
- **THEN** the message "Installation complete" SHALL be written to stdout with success-level formatting

#### Scenario: Plain message

- **WHEN** a handler calls `log.message("See docs for details")`
- **THEN** the message "See docs for details" SHALL be written to stdout without semantic formatting

### Requirement: Log service is injectable and testable

The Log service SHALL be a self-contained module under `src/tui/log/` with its own Effect service tag, live layer, and test layer factory. The test layer factory SHALL return a `[Layer, MockLogService]` tuple where the mock records all log calls for assertion.

#### Scenario: Mock records log calls

- **WHEN** a handler calls `log.info("a")` then `log.warn("b")` using the test layer
- **THEN** the mock service SHALL record `["a"]` in its info log and `["b"]` in its warn log

#### Scenario: Handler depends only on Log

- **WHEN** a handler uses only the Log service
- **THEN** its Effect type signature SHALL require only `Log` — not all TUI services

### Requirement: Dev demo for log

The dev entry point at `src/dev/tui.ts` SHALL include a `log` sub-command for manually testing log output.

#### Scenario: Run log demo

- **WHEN** a developer runs `pnpm tui log`
- **THEN** the dev entry point SHALL render examples of each log level (info, warn, error, success, message)
