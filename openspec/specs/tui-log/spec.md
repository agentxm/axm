## MODIFIED Requirements

### Requirement: Log service provides semantic log output

The logging capability SHALL be provided by `ClackLog` under `src/clack-effect/log/`. It SHALL provide semantic output methods `info`, `warn`, `error`, `success`, and `message`, each accepting a string and returning `Effect<void>`. It MAY also expose additional clack-native methods (`intro`, `outro`, `cancel`, `note`, `box`) without changing existing command behavior.

#### Scenario: Info message

- **WHEN** a handler calls `log.info("Processing 3 skills")`
- **THEN** that message SHALL be written with info-level formatting

#### Scenario: Warning message

- **WHEN** a handler calls `log.warn("Skill already installed")`
- **THEN** that message SHALL be written with warning-level formatting

#### Scenario: Error message

- **WHEN** a handler calls `log.error("Failed to resolve source")`
- **THEN** that message SHALL be written with error-level formatting

#### Scenario: Success message

- **WHEN** a handler calls `log.success("Installation complete")`
- **THEN** that message SHALL be written with success-level formatting

#### Scenario: Plain message

- **WHEN** a handler calls `log.message("See docs for details")`
- **THEN** that message SHALL be written without semantic prefixing requirements

### Requirement: Log service is injectable and testable

The log service SHALL expose an Effect service tag, live layer, and test layer factory from `src/clack-effect/log/`. The test layer factory SHALL return `[Layer, MockClackLogService]` and record log calls for assertions.

#### Scenario: Mock records log calls

- **WHEN** code calls `log.info("a")` then `log.warn("b")` with clack log test layer
- **THEN** the mock SHALL record both calls with method names and messages

#### Scenario: Handler depends only on ClackLog

- **WHEN** a handler uses only logging behavior
- **THEN** its Effect type signature SHALL require only `ClackLog`

### Requirement: Dev demo for log

The dev command at `src/dev-cli-commands/tui/log/command.ts` SHALL provide log output demos backed by `ClackLog` and `ClackLive`.

#### Scenario: Run log demo

- **WHEN** a developer runs the dev CLI log demo command
- **THEN** the command SHALL render examples of supported log levels
