## Purpose

The `CliEnvironment` service provides centralized resolution and access to environment-level CLI flags (`--non-interactive`, `--verbose`, `--debug`). These flags are resolved once at program startup and consumed as an Effect service by handlers, the workspace service, and the prompt service.

Per-command flags (`--yes`, `--force`, `--preview`) are **not** part of the service. They are defined as reusable `Flag` definitions and threaded explicitly through handler args at the command boundary.

## Requirements

### Requirement: CliEnvironment Service Interface

The `CliEnvironment` service SHALL expose four resolved fields: `isCI`, `nonInteractive`, `verbose`, and `debug`.

#### Scenario: Service provides resolved environment values

- **WHEN** a handler yields `CliEnvironment`
- **THEN** it receives a `CliEnvironmentService` with `isCI`, `nonInteractive`, `verbose`, and `debug` as resolved booleans

### Requirement: Non-Interactive Resolution Chain

The `nonInteractive` flag SHALL be resolved using a fallback chain: explicit `--non-interactive` flag, then `CI` environment variable, then TTY detection.

#### Scenario: Explicit --non-interactive true overrides auto-detection

- **WHEN** the user passes `--non-interactive`
- **THEN** `flags.nonInteractive` SHALL be `true`
- **AND** CI and TTY detection SHALL NOT be evaluated

#### Scenario: Explicit --non-interactive false overrides auto-detection

- **WHEN** the user passes `--no-non-interactive`
- **THEN** `flags.nonInteractive` SHALL be `false`
- **AND** CI and TTY detection SHALL NOT be evaluated

#### Scenario: CI environment variable detected when flag omitted

- **WHEN** `--non-interactive` is not passed
- **AND** `process.env.CI` equals `"true"`
- **THEN** `flags.nonInteractive` SHALL be `true`

#### Scenario: Non-TTY stdin detected when flag and CI omitted

- **WHEN** `--non-interactive` is not passed
- **AND** `process.env.CI` is not `"true"`
- **AND** `process.stdin.isTTY` is not `true`
- **THEN** `flags.nonInteractive` SHALL be `true`

#### Scenario: Interactive TTY with no flag and no CI

- **WHEN** `--non-interactive` is not passed
- **AND** `process.env.CI` is not `"true"`
- **AND** `process.stdin.isTTY` is `true`
- **THEN** `flags.nonInteractive` SHALL be `false`

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

### Requirement: Layer Construction

The `CliEnvironment` layer SHALL resolve environment flags from CLI globals and optional env var overrides. The `nonInteractive` input SHALL be `Option<boolean>` to distinguish "not passed" from "explicitly false".

#### Scenario: Option.none triggers auto-detection

- **WHEN** the `nonInteractive` input is `Option.none()`
- **THEN** the resolution chain (CI -> TTY) SHALL be evaluated

#### Scenario: Option.some bypasses auto-detection

- **WHEN** the `nonInteractive` input is `Option.some(true)` or `Option.some(false)`
- **THEN** the explicit value SHALL be used
- **AND** CI and TTY detection SHALL NOT be evaluated

### Requirement: Layer accepts env var overrides for verbosity

The `makeCliEnvironmentLayer` function SHALL accept optional `envVerbose` and `envDebug` boolean options for environment variable overrides. These allow CLI packages to resolve their own env var names and pass the result to core.

#### Scenario: envVerbose passed as true

- **WHEN** `makeCliEnvironmentLayer` is called with `envVerbose: true`
- **AND** `--verbose` is not passed
- **THEN** `flags.verbose` SHALL be `true`

#### Scenario: envDebug passed as true

- **WHEN** `makeCliEnvironmentLayer` is called with `envDebug: true`
- **AND** `--debug` is not passed
- **THEN** `flags.debug` SHALL be `true`
- **AND** `flags.verbose` SHALL be `true`

#### Scenario: CLI flag overrides env var

- **WHEN** `makeCliEnvironmentLayer` is called with `envVerbose: false`
- **AND** the user passes `--verbose`
- **THEN** `flags.verbose` SHALL be `true`

### Requirement: CliEnvironment Provided at Runtime Boundary

The `run()` function SHALL construct and provide the `CliEnvironment` layer. All programs executed through `run()` SHALL have access to the `CliEnvironment` service.

#### Scenario: run() provides CliEnvironment layer

- **WHEN** a command handler calls `run()`
- **THEN** the `CliEnvironment` layer SHALL be constructed
- **AND** the program SHALL be able to yield `CliEnvironment`

### Requirement: Per-Command Flags Threaded via Handler Args

Per-command flags (`yes`, `force`, `preview`) SHALL NOT be part of the `CliEnvironment` service. They are defined as reusable `Flag` definitions and passed as explicit parameters to handler functions.

#### Scenario: Handler receives per-command flags as function parameters

- **WHEN** a command declares `--yes`, `--force`, or `--preview` flags
- **THEN** the command boundary SHALL pass their values to the handler as function arguments
- **AND** the handler SHALL NOT read them from any service

### Requirement: Prompt Service Non-Interactive Guard

The `ClackPromptService` SHALL depend on `CliEnvironment` and fail fast with an `AppError` when any prompt method is called in non-interactive mode.

#### Scenario: Prompt called in non-interactive mode fails

- **WHEN** `flags.nonInteractive` is `true`
- **AND** any prompt method is called (text, confirm, select, multiselect, etc.)
- **THEN** the prompt SHALL fail with an `AppError` with code `PROMPT_IN_NON_INTERACTIVE`
- **AND** the error SHALL indicate this is a bug in the handler

#### Scenario: Prompt called in interactive mode proceeds normally

- **WHEN** `flags.nonInteractive` is `false`
- **AND** a prompt method is called
- **THEN** the prompt SHALL render interactively as before

### Requirement: Test Layer Helper

A test helper SHALL provide a `CliEnvironment` layer with sensible defaults for test environments.

#### Scenario: Default test flags are non-interactive

- **WHEN** a test uses the `CliEnvironment` test helper without overrides
- **THEN** `nonInteractive` SHALL default to `true`
- **AND** `verbose` SHALL default to `false`
- **AND** `debug` SHALL default to `false`
- **AND** `isCI` SHALL default to `false`

#### Scenario: Test helper accepts overrides

- **WHEN** a test provides partial overrides to the test helper
- **THEN** the overrides SHALL be merged with defaults
