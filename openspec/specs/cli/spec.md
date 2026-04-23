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
- **THEN** the output includes the `setup`, `skills`, `login`, `logout`, `whoami`, and `token` commands with descriptions

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

### Requirement: Command group naming

The AUTHENTICATION command group SHALL be renamed to AUTH AND CONFIG.

#### Scenario: Auth and config group in help

- **WHEN** the user runs `axm --help`
- **THEN** the output SHALL show auth commands and `upgrade` under an "AUTH AND CONFIG" group heading
- **AND** there SHALL NOT be an "AUTHENTICATION" group heading

### Requirement: Standard Flags

The CLI SHALL support standard global flags for controlling output, interactivity, and execution behavior. Global flags available across the CLI SHALL include `--yes` (`-y`), `--non-interactive`, `--force` (`-f`), `--preview`, `-q` / `--quiet`, `-v` / `--verbose`, and `-vv` / `--debug`. The `--json` flag SHALL appear only on commands that support machine-readable output.

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

#### Scenario: Quiet flag suppresses non-essential output

- **WHEN** the user runs any command with `-q` or `--quiet`
- **THEN** informational output SHALL be suppressed
- **AND** warnings and errors SHALL remain visible

#### Scenario: Verbose flag shows additional detail

- **WHEN** the user runs any command with `-v` or `--verbose`
- **THEN** the CLI SHALL include detail that is hidden at the normal output level

#### Scenario: Debug flag shows maximal detail

- **WHEN** the user runs any command with `-vv` or `--debug`
- **THEN** the CLI SHALL include the most detailed diagnostic output level

#### Scenario: JSON flag absent on commands without machine output

- **WHEN** the user runs a command that does not support `--json`
- **THEN** the command help SHALL NOT list `--json`
- **AND** passing `--json` SHALL fail as an unrecognized flag

#### Scenario: Global flags appear in all command help

- **WHEN** the user runs `axm <command> --help`
- **THEN** `--yes`, `--non-interactive`, `--force`, and `--preview` SHALL appear in the help output

#### Scenario: Commands do not redefine global flags

- **WHEN** a command builder is defined
- **THEN** the command SHALL preserve the shared meaning of the standard global flags

### Requirement: Interactive mode detection

When the user does not pass `--non-interactive`, the CLI SHALL auto-detect whether prompting is allowed from the runtime environment.

#### Scenario: Explicit non-interactive flag wins

- **WHEN** the user passes `--non-interactive`
- **THEN** the CLI SHALL behave as non-interactive regardless of terminal detection or CI environment

#### Scenario: CI defaults to non-interactive

- **WHEN** `CI=true`
- **AND** the user does not explicitly opt back into interactivity
- **THEN** the CLI SHALL behave as non-interactive

#### Scenario: Non-TTY stdin defaults to non-interactive

- **WHEN** stdin is not a TTY
- **AND** the user does not explicitly opt back into interactivity
- **THEN** the CLI SHALL behave as non-interactive

#### Scenario: Interactive terminal remains interactive

- **WHEN** stdin is a TTY
- **AND** `CI` is not forcing non-interactive behavior
- **AND** the user does not pass `--non-interactive`
- **THEN** the CLI SHALL prompt normally

### Requirement: Output modes

The CLI SHALL keep machine-readable results separate from human-oriented status output.

#### Scenario: JSON output stays machine-readable

- **WHEN** the user runs a command with `--json`
- **THEN** machine-readable result data SHALL be written to stdout
- **AND** progress, notes, and other human status output SHALL NOT pollute stdout

#### Scenario: Human-readable lists and details remain readable by default

- **WHEN** the user runs a list or detail command without `--json`
- **THEN** the CLI SHALL render human-readable output suitable for terminal use

### Requirement: Telemetry Preferences

The CLI SHALL let the user control telemetry with environment variables and settings. Telemetry SHALL never block commands or surface telemetry delivery failures to the user.

#### Scenario: Do Not Track disables telemetry

- **WHEN** `DO_NOT_TRACK=1`
- **THEN** the CLI SHALL send no usage or error telemetry

#### Scenario: Errors-only mode reports failures only

- **WHEN** telemetry is set to `errors` through configuration or `AXM_TELEMETRY=errors`
- **THEN** the CLI SHALL send error reports
- **AND** SHALL NOT send usage events

#### Scenario: Environment overrides settings

- **WHEN** both environment variables and settings define telemetry behavior
- **THEN** environment variables SHALL win

#### Scenario: Telemetry failures are silent

- **WHEN** telemetry delivery fails
- **THEN** the command's output and exit code SHALL remain unchanged

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

#### Scenario: setup with --yes still prompts for agent selection

- **WHEN** the user runs `axm setup --yes` and multiple agents are detected
- **AND** `--agent` is not provided
- **THEN** the CLI SHALL prompt for agent selection
- **AND** SHALL only skip confirmation prompts

#### Scenario: setup with --non-interactive auto-selects all agents

- **WHEN** the user runs `axm setup --non-interactive` and multiple agents are detected
- **AND** `--agent` is not provided
- **THEN** the CLI SHALL auto-select all detected agents (default behavior)
- **AND** SHALL NOT prompt

### Requirement: Error Message Format

The CLI SHALL provide actionable error messages with recovery guidance. Expected command failures and explicit user cancellation SHALL be handled cleanly. Unexpected failures SHALL be treated as defects.

#### Scenario: Expected error exits with code 1

- **WHEN** an expected command failure reaches the runtime boundary
- **THEN** the CLI SHALL print an actionable error message
- **AND** exit with code 1

#### Scenario: User cancellation exits cleanly

- **WHEN** the user cancels an interactive prompt
- **THEN** the CLI SHALL exit with code 0
- **AND** SHALL NOT print an error message

#### Scenario: Defect exits with code 2

- **WHEN** an unexpected unhandled failure reaches the runtime boundary
- **THEN** the CLI SHALL print a defect-style failure message
- **AND** exit with code 2

#### Scenario: Error includes what happened

- **WHEN** an error occurs
- **THEN** the error message describes what went wrong

#### Scenario: Error includes how to fix

- **WHEN** an error has a known recovery path
- **THEN** the error message suggests how to resolve the issue
