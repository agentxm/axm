## MODIFIED Requirements

### Requirement: CliFlags Service Interface

The `CliFlags` service SHALL expose six resolved boolean fields: `nonInteractive`, `verbose`, `debug`, `yes`, `force`, and `preview`.

#### Scenario: Service provides resolved flag values

- **WHEN** a handler yields `CliFlags`
- **THEN** it receives a `CliFlagsService` with `nonInteractive`, `verbose`, `debug`, `yes`, `force`, and `preview` as resolved booleans

#### Scenario: yes stores only the explicit flag value

- **WHEN** `--yes` is not passed and `--non-interactive` is active
- **THEN** `flags.yes` SHALL be `false`
- **AND** `flags.nonInteractive` SHALL be `true`

### Requirement: Test Layer Helper

A test helper SHALL provide a `CliFlags` layer with sensible defaults for test environments.

#### Scenario: Default test flags are non-interactive

- **WHEN** a test uses the `CliFlags` test helper without overrides
- **THEN** `nonInteractive` SHALL default to `true`
- **AND** `verbose` SHALL default to `false`
- **AND** `debug` SHALL default to `false`
- **AND** `yes` SHALL default to `false`
- **AND** `force` SHALL default to `false`
- **AND** `preview` SHALL default to `false`

#### Scenario: Test helper accepts overrides

- **WHEN** a test provides partial overrides to the test helper
- **THEN** the overrides SHALL be merged with defaults

## ADDED Requirements

### Requirement: Verbose Resolution Chain

The `verbose` flag SHALL be resolved by combining the `--verbose` CLI flag with the `AXM_VERBOSE` environment variable. `--debug` SHALL imply `--verbose`.

#### Scenario: Explicit --verbose flag

- **WHEN** the user passes `--verbose`
- **THEN** `flags.verbose` SHALL be `true`

#### Scenario: AXM_VERBOSE environment variable

- **WHEN** `--verbose` is not passed
- **AND** `AXM_VERBOSE` is `"true"` or `"1"`
- **THEN** `flags.verbose` SHALL be `true`

#### Scenario: --debug implies --verbose

- **WHEN** the user passes `--debug` without `--verbose`
- **THEN** `flags.verbose` SHALL be `true`
- **AND** `flags.debug` SHALL be `true`

#### Scenario: No verbose flag or env var

- **WHEN** `--verbose` is not passed
- **AND** `AXM_VERBOSE` is not set
- **AND** `--debug` is not passed
- **THEN** `flags.verbose` SHALL be `false`

### Requirement: Debug Resolution Chain

The `debug` flag SHALL be resolved by combining the `--debug` CLI flag with the `AXM_DEBUG` environment variable.

#### Scenario: Explicit --debug flag

- **WHEN** the user passes `--debug`
- **THEN** `flags.debug` SHALL be `true`

#### Scenario: AXM_DEBUG environment variable

- **WHEN** `--debug` is not passed
- **AND** `AXM_DEBUG` is `"true"` or `"1"`
- **THEN** `flags.debug` SHALL be `true`

#### Scenario: No debug flag or env var

- **WHEN** `--debug` is not passed
- **AND** `AXM_DEBUG` is not set
- **THEN** `flags.debug` SHALL be `false`

### Requirement: Layer accepts env var overrides for verbosity

The `makeCliFlagsLayer` function SHALL accept optional `envVerbose` and `envDebug` boolean options for environment variable overrides. These allow CLI packages to resolve their own env var names and pass the result to core.

#### Scenario: envVerbose passed as true

- **WHEN** `makeCliFlagsLayer` is called with `envVerbose: true`
- **AND** `--verbose` is not passed
- **THEN** `flags.verbose` SHALL be `true`

#### Scenario: envDebug passed as true

- **WHEN** `makeCliFlagsLayer` is called with `envDebug: true`
- **AND** `--debug` is not passed
- **THEN** `flags.debug` SHALL be `true`
- **AND** `flags.verbose` SHALL be `true`

#### Scenario: CLI flag overrides env var

- **WHEN** `makeCliFlagsLayer` is called with `envVerbose: false`
- **AND** the user passes `--verbose`
- **THEN** `flags.verbose` SHALL be `true`
