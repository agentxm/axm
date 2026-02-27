## MODIFIED Requirements

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
