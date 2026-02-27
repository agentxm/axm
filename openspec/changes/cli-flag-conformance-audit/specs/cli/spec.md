## MODIFIED Requirements

### Requirement: Standard Flags

The CLI SHALL support standard flags for controlling output, interactivity, and safety overrides.

#### Scenario: --yes flag skips confirmation prompts only

- **WHEN** the user runs any command with `--yes`
- **THEN** the CLI auto-accepts all yes/no confirmation prompts
- **AND** the CLI does NOT supply defaults for selection or text input prompts
- **AND** the CLI does NOT override constraints that would cause failure

#### Scenario: --non-interactive flag disables prompts

- **WHEN** the user runs any command with `--non-interactive`
- **THEN** the CLI never prompts for input
- **AND** the CLI uses default values where available
- **AND** the CLI fails with a clear error if required input has no default and no flag provides it
- **AND** the error message SHALL tell the user which flag to pass instead

#### Scenario: --non-interactive implies --yes

- **WHEN** the user runs any command with `--non-interactive`
- **THEN** all confirmation prompts SHALL be auto-accepted as if `--yes` were also passed
- **AND** the user does NOT need to pass both `--non-interactive` and `--yes`

#### Scenario: --force overrides constraints that cause failure

- **WHEN** the user runs a command with `--force` and the operation would fail due to a constraint (e.g., already installed, version conflict)
- **THEN** the CLI proceeds despite the constraint
- **AND** a warning is displayed describing the overridden constraint

#### Scenario: --force does not skip confirmations

- **WHEN** the user runs a command with `--force` but without `--yes`
- **AND** the command has a confirmation prompt
- **THEN** the confirmation prompt SHALL still be shown

#### Scenario: Constraint failure without --force suggests the flag

- **WHEN** a command fails due to a constraint that `--force` can override
- **THEN** the error message SHALL suggest using `--force` to override
- **AND** the error SHALL describe the constraint that caused failure

#### Scenario: JSON flag outputs machine-readable format

- **WHEN** the user runs any command with `--json`
- **THEN** the CLI outputs results in JSON format to stdout
- **AND** progress messages are suppressed or sent to stderr

### Requirement: TTY Detection

The CLI SHALL detect TTY availability and auto-enable `--non-interactive` when stdin is not a TTY.

#### Scenario: Non-TTY stdin enables non-interactive mode

- **WHEN** `process.stdin.isTTY` is false
- **AND** the user has NOT explicitly passed `--non-interactive`
- **THEN** the CLI SHALL behave as if `--non-interactive` were passed
- **AND** this SHALL imply `--yes` behavior

#### Scenario: CI environment enables non-interactive mode

- **WHEN** the `CI` environment variable is set to `"true"`
- **AND** the user has NOT explicitly passed `--non-interactive`
- **THEN** the CLI SHALL behave as if `--non-interactive` were passed

#### Scenario: Non-TTY stdout disables fancy output

- **WHEN** `process.stdout.isTTY` is false
- **THEN** the CLI disables colors, spinners, and other ANSI escape sequences
- **AND** outputs plain text suitable for piping

## ADDED Requirements

### Requirement: --force flag propagation

Commands that accept `--force` SHALL propagate the flag through their entire execution chain to the plan resolution layer.

#### Scenario: skills install propagates --force

- **WHEN** the user runs `axm skills install <source> --force`
- **THEN** the `--force` flag SHALL reach `resolvePlan` and override error-readiness constraints

#### Scenario: packs install propagates --force

- **WHEN** the user runs `axm packs install <source> --force`
- **THEN** the `--force` flag SHALL reach `resolvePlan` and override error-readiness constraints

#### Scenario: --force flag description consistency

- **WHEN** any command defines a `--force` option
- **THEN** the description SHALL be "Override constraints that would cause failure"
- **AND** SHALL NOT describe warning auto-acceptance or prompt skipping

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
