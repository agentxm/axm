## MODIFIED Requirements

### Requirement: Log service provides semantic log output

The logging capability SHALL be provided by the `Output` service at `src/output/`. It SHALL provide semantic output methods `info`, `warn`, `error`, `success`, `message`, `step`, `intro`, `outro`, `cancel`, `note`, and `box`, each accepting a string and returning `Effect<void>`.

#### Scenario: Info message

- **WHEN** a handler calls `output.info("Processing 3 skills")`
- **THEN** that message SHALL be written with info-level formatting

#### Scenario: Warning message

- **WHEN** a handler calls `output.warn("Skill already installed")`
- **THEN** that message SHALL be written with warning-level formatting

#### Scenario: Error message

- **WHEN** a handler calls `output.error("Failed to resolve source")`
- **THEN** that message SHALL be written with error-level formatting

#### Scenario: Success message

- **WHEN** a handler calls `output.success("Installation complete")`
- **THEN** that message SHALL be written with success-level formatting

#### Scenario: Plain message

- **WHEN** a handler calls `output.message("See docs for details")`
- **THEN** that message SHALL be written without semantic prefixing requirements

### Requirement: Log service is injectable and testable

The output service SHALL expose an Effect service tag, live layer, and test layer factory from `src/output/`. The test layer factory `makeOutputTestLayer()` SHALL return `[Layer, MockOutputService]` and record output calls for assertions.

#### Scenario: Mock records log calls

- **WHEN** code calls `output.info("a")` then `output.warn("b")` with the output test layer
- **THEN** the mock SHALL record both calls with method names and messages

#### Scenario: Handler depends only on Output

- **WHEN** a handler uses only logging behavior
- **THEN** its Effect type signature SHALL require only `Output`

### Requirement: Dev demo for log

The dev command at `src/dev-cli-commands/tui/log/command.ts` SHALL provide log output demos backed by `Output` and `OutputLive`.

#### Scenario: Run log demo

- **WHEN** a developer runs the dev CLI log demo command
- **THEN** the command SHALL render examples of supported log levels
