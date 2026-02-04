## MODIFIED Requirements

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
