# cli Specification

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
- **THEN** the output includes the `init`, `skills`, `login`, `logout`, `whoami`, and `token` commands with descriptions

#### Scenario: CLI displays examples

- **WHEN** the user runs `axm`
- **THEN** the output includes 1-2 example invocations

#### Scenario: CLI help flag

- **WHEN** the user runs `axm --help`
- **THEN** the CLI displays the same help information as running `axm` alone

### Requirement: Auth command registration

The CLI SHALL register `login`, `logout`, `whoami`, and `token` as top-level commands and as subcommands under `axm auth`.

#### Scenario: Top-level login alias

- **WHEN** the user runs `axm login`
- **THEN** the CLI SHALL execute the device code login flow
- **AND** the behavior SHALL be identical to `axm auth login`

#### Scenario: Top-level logout alias

- **WHEN** the user runs `axm logout`
- **THEN** the CLI SHALL execute the logout flow
- **AND** the behavior SHALL be identical to `axm auth logout`

#### Scenario: Top-level whoami alias

- **WHEN** the user runs `axm whoami`
- **THEN** the CLI SHALL execute the whoami flow
- **AND** the behavior SHALL be identical to `axm auth whoami`

#### Scenario: Top-level token alias

- **WHEN** the user runs `axm token`
- **THEN** the CLI SHALL execute the token output flow
- **AND** the behavior SHALL be identical to `axm auth token`

#### Scenario: Auth command group

- **WHEN** the user runs `axm auth`
- **THEN** the CLI SHALL display available auth subcommands: `login`, `logout`, `whoami`, `token`

#### Scenario: Auth commands do not require workspace

- **WHEN** the user runs `axm login`, `axm logout`, `axm whoami`, or `axm token` outside an axm-initialized directory
- **THEN** the commands SHALL work without a workspace context
- **AND** SHALL NOT require `.axm/settings.json` to exist

### Requirement: Standard Flags

The CLI SHALL support standard global flags for controlling output, interactivity, and execution behavior. The flags `--yes` (`-y`), `--non-interactive`, `--force` (`-f`), and `--preview` SHALL be defined once globally in the root yargs configuration. Individual commands SHALL NOT redefine these flags.

#### Scenario: JSON flag outputs machine-readable format

- **WHEN** the user runs any command with `--json`
- **THEN** the CLI outputs results in JSON format to stdout
- **AND** progress messages are suppressed or sent to stderr

#### Scenario: Non-interactive flag disables prompts

- **WHEN** the user runs any command with `--non-interactive`
- **THEN** the CLI never prompts for input
- **AND** the CLI uses default values or fails with a clear error if input is required

#### Scenario: Yes flag auto-accepts confirmations

- **WHEN** the user runs any command with `--yes` or `-y`
- **THEN** the CLI auto-accepts confirmation prompts
- **AND** the CLI does not supply missing input or override errors

#### Scenario: Force flag overrides constraints

- **WHEN** the user runs any command with `--force` or `-f`
- **THEN** the CLI overrides constraints that would otherwise cause failure
- **AND** the CLI does not imply `--yes` or `--non-interactive`

#### Scenario: Preview flag displays plan without applying

- **WHEN** the user runs any command with `--preview`
- **THEN** the CLI displays the execution plan
- **AND** the CLI requires `--yes` or interactive confirmation to apply

#### Scenario: Non-interactive flag has no default

- **WHEN** `--non-interactive` is not passed by the user
- **THEN** the parsed argv value SHALL be `undefined`
- **AND** the `CliFlags` service SHALL apply auto-detection (CI env, TTY)

#### Scenario: Global flags appear in all command help

- **WHEN** the user runs `axm <command> --help`
- **THEN** `--yes`, `--non-interactive`, `--force`, and `--preview` SHALL appear in the help output

#### Scenario: Commands do not redefine global flags

- **WHEN** a command builder is defined
- **THEN** it SHALL NOT call `.option()` for `yes`, `non-interactive`, `force`, or `preview`

### Requirement: --yes does not supply selection defaults

Commands with selection prompts SHALL NOT use `--yes` to auto-select defaults. Selection defaults SHALL be controlled by `--non-interactive` or explicit flags (e.g., `--all`).

#### Scenario: skills install with --yes still prompts for selection

- **WHEN** the user runs `axm skills install <source> --yes` and multiple skills are discovered
- **AND** neither `--all` nor `--skill` is provided
- **THEN** the CLI SHALL prompt for skill selection
- **AND** SHALL only skip the plan confirmation prompt

#### Scenario: skills install with --non-interactive auto-selects all

- **WHEN** the user runs `axm skills install <source> --non-interactive` and multiple skills are discovered
- **AND** neither `--all` nor `--skill` is provided
- **THEN** the CLI SHALL auto-select all discovered skills (default behavior)
- **AND** SHALL NOT prompt

#### Scenario: init with --yes still prompts for agent selection

- **WHEN** the user runs `axm init --yes` and multiple agents are detected
- **AND** `--agent` is not provided
- **THEN** the CLI SHALL prompt for agent selection
- **AND** SHALL only skip confirmation prompts

#### Scenario: init with --non-interactive auto-selects all agents

- **WHEN** the user runs `axm init --non-interactive` and multiple agents are detected
- **AND** `--agent` is not provided
- **THEN** the CLI SHALL auto-select all detected agents (default behavior)
- **AND** SHALL NOT prompt

### Requirement: Error Message Format

The CLI SHALL provide actionable error messages with recovery guidance. All errors reaching the runtime boundary SHALL be either `AppError` (expected errors) or `PromptCancelled` (user cancellation). Any other error reaching the boundary SHALL be treated as a defect.

#### Scenario: Expected error exits with code 1

- **WHEN** a `AppError` reaches the runtime boundary
- **THEN** the CLI SHALL render it using `renderAppError`
- **AND** exit with code 1

#### Scenario: User cancellation exits cleanly

- **WHEN** a `PromptCancelled` reaches the runtime boundary
- **THEN** the CLI SHALL exit with code 0
- **AND** SHALL NOT print an error message

#### Scenario: Defect exits with code 2

- **WHEN** an unhandled error (not `AppError` or `PromptCancelled`) reaches the runtime boundary
- **THEN** the CLI SHALL render it using `renderDefect`
- **AND** exit with code 2

#### Scenario: Error includes what happened

- **WHEN** an error occurs
- **THEN** the error message describes what went wrong

#### Scenario: Error includes how to fix

- **WHEN** an error has a known recovery path
- **THEN** the error message suggests how to resolve the issue
