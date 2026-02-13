## Purpose

The CLI provides the primary user interface for the axm tool.

## Requirements

### Requirement: Root Command Behavior

The CLI SHALL display help and exit cleanly when invoked without arguments.

#### Scenario: CLI invoked without arguments

- **WHEN** the user runs `axm` without any arguments
- **THEN** the CLI displays available commands, examples, and usage information
- **AND** exits with code 0

#### Scenario: CLI displays available commands

- **WHEN** the user runs `axm`
- **THEN** the output includes the `init` and `skills` commands with descriptions

#### Scenario: CLI displays examples

- **WHEN** the user runs `axm`
- **THEN** the output includes 1-2 example invocations

#### Scenario: CLI help flag

- **WHEN** the user runs `axm --help`
- **THEN** the CLI displays the same help information as running `axm` alone

### Requirement: Command File Organization

CLI commands SHALL follow the project structure defined in CLAUDE.md, organizing files by command hierarchy with colocated tests.

#### Scenario: Top-level command directory structure

- **WHEN** a new CLI command is added
- **THEN** its files are placed in `packages/cli/src/commands/<command>/`
- **AND** the yargs command definition is in `command.ts`
- **AND** the Effect handler is in `handler.ts`
- **AND** handler tests are in `handler.test.ts`

#### Scenario: Subcommand directory structure

- **WHEN** a command has subcommands
- **THEN** each subcommand has its own directory under the parent command
- **AND** files follow the same pattern: `<command>/<subcommand>/command.ts`, `handler.ts`, `handler.test.ts`

#### Scenario: Test colocation

- **WHEN** tests exist for a handler
- **THEN** tests are colocated with the handler file as `handler.test.ts`
- **AND** tests are NOT placed in separate `__tests__/` directories

### Requirement: Standard Flags

The CLI SHALL support standard flags for controlling output and interactivity.

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

The CLI SHALL provide actionable error messages with recovery guidance. All errors reaching the runtime boundary SHALL be either `CliError` (expected errors) or `PromptCancelled` (user cancellation). Any other error reaching the boundary SHALL be treated as a defect.

#### Scenario: Expected error exits with code 1

- **WHEN** a `CliError` reaches the runtime boundary
- **THEN** the CLI SHALL render it using `renderCliError`
- **AND** exit with code 1

#### Scenario: User cancellation exits cleanly

- **WHEN** a `PromptCancelled` reaches the runtime boundary
- **THEN** the CLI SHALL exit with code 0
- **AND** SHALL NOT print an error message

#### Scenario: Defect exits with code 2

- **WHEN** an unhandled error (not `CliError` or `PromptCancelled`) reaches the runtime boundary
- **THEN** the CLI SHALL render it using `renderDefect`
- **AND** exit with code 2

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
