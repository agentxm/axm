## MODIFIED Requirements

### Requirement: Non-Interactive Resolution Chain

The `nonInteractive` flag SHALL be resolved using a fallback chain: explicit `--non-interactive` flag, then `CI` environment variable, then TTY detection. The resolved value SHALL be provided to the `CliPrompt` layer at the `run()` boundary via a `nonInteractiveFlag` GlobalFlag setting.

#### Scenario: Explicit --non-interactive true overrides auto-detection

- **WHEN** the user passes `--non-interactive`
- **THEN** the prompt layer SHALL treat the session as non-interactive
- **AND** CI and TTY detection SHALL NOT be evaluated

#### Scenario: Explicit --non-interactive false overrides auto-detection

- **WHEN** the user passes `--no-non-interactive`
- **THEN** the prompt layer SHALL treat the session as interactive
- **AND** CI and TTY detection SHALL NOT be evaluated

#### Scenario: CI environment variable detected when flag omitted

- **WHEN** `--non-interactive` is not passed
- **AND** `process.env.CI` equals `"true"`
- **THEN** the prompt layer SHALL treat the session as non-interactive

#### Scenario: Non-TTY stdin detected when flag and CI omitted

- **WHEN** `--non-interactive` is not passed
- **AND** `process.env.CI` is not `"true"`
- **AND** `process.stdin.isTTY` is not `true`
- **THEN** the prompt layer SHALL treat the session as non-interactive

#### Scenario: Interactive TTY with no flag and no CI

- **WHEN** `--non-interactive` is not passed
- **AND** `process.env.CI` is not `"true"`
- **AND** `process.stdin.isTTY` is `true`
- **THEN** the prompt layer SHALL treat the session as interactive

## ADDED Requirements

### Requirement: Quiet flag definition

A `-q` / `--quiet` global flag SHALL be defined in `cli-flags/index.ts`. It SHALL suppress non-essential output. The flag feeds into `Verbosity` level resolution at the `run()` boundary.

#### Scenario: Quiet flag is available globally

- **WHEN** any command is run with `-q` or `--quiet`
- **THEN** the verbosity level SHALL be set to `quiet`

### Requirement: JSON per-command flag definition

A `--json` boolean flag SHALL be defined as a reusable per-command `Flag` definition in `cli-flags/index.ts`. Only commands that declare an output schema SHALL include this flag. The flag SHALL appear in `--help` only for commands that declare it.

#### Scenario: JSON flag on a command with output schema

- **WHEN** a command declares the `--json` flag and an output schema
- **AND** the user passes `--json`
- **THEN** the `run()` boundary SHALL select the `MachineRenderer`
- **AND** data output SHALL be JSON on stdout

#### Scenario: JSON flag absent on commands without output schema

- **WHEN** a command does not declare the `--json` flag
- **THEN** `--json` SHALL NOT appear in the command's `--help` output
- **AND** passing `--json` SHALL result in an unrecognized flag error
