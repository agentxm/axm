## ADDED Requirements

### Requirement: Standard Flags

The CLI SHALL support standard flags for controlling output and interactivity.

#### Scenario: Verbose flag increases output detail

- **WHEN** the user runs any command with `--verbose` or `-v`
- **THEN** the CLI displays additional diagnostic information

#### Scenario: Quiet flag suppresses non-essential output

- **WHEN** the user runs any command with `--quiet` or `-q`
- **THEN** the CLI suppresses progress indicators and informational messages
- **AND** only errors and primary output are displayed

#### Scenario: JSON flag outputs machine-readable format

- **WHEN** the user runs any command with `--json`
- **THEN** the CLI outputs results in JSON format to stdout
- **AND** progress messages are suppressed or sent to stderr

#### Scenario: Non-interactive flag disables prompts

- **WHEN** the user runs any command with `--non-interactive`
- **THEN** the CLI never prompts for input
- **AND** the CLI uses default values or fails with a clear error if input is required

### Requirement: TTY Detection

The CLI SHALL detect TTY availability for interactive prompts and output formatting.

#### Scenario: Non-TTY stdin prevents prompts

- **WHEN** `process.stdin.isTTY` is false
- **AND** the command would normally prompt for input
- **AND** no flag provides the required input
- **THEN** the CLI exits with code 1
- **AND** displays a message suggesting `--yes` or `--non-interactive`

#### Scenario: Non-TTY stdout disables fancy output

- **WHEN** `process.stdout.isTTY` is false
- **THEN** the CLI disables colors, spinners, and other ANSI escape sequences
- **AND** outputs plain text suitable for piping

### Requirement: Error Message Format

The CLI SHALL provide actionable error messages with recovery guidance.

#### Scenario: Error includes what happened

- **WHEN** an error occurs
- **THEN** the error message describes what went wrong

#### Scenario: Error includes how to fix

- **WHEN** an error has a known recovery path
- **THEN** the error message suggests how to resolve the issue

### Requirement: Parser Unit Testing

CLI commands SHALL have parser unit tests for yargs validation.

#### Scenario: Parser tests isolate yargs behavior

- **WHEN** testing CLI argument parsing
- **THEN** tests use a fresh yargs instance with `.exitProcess(false)` and `.fail(false)`
- **AND** tests verify required arguments, defaults, and type coercion

#### Scenario: Parser tests are colocated

- **WHEN** a command has parser tests
- **THEN** tests are in `command.test.ts` alongside `command.ts`
