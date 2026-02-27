## Purpose

The `CliFlags` service provides centralized resolution and access to CLI behavior flags (`--yes`, `--non-interactive`, `--force`, `--preview`). Flags are resolved once at program startup and consumed as an Effect service by handlers, the workspace service, and the prompt service.

## Requirements

### Requirement: CliFlags Service Interface

The `CliFlags` service SHALL expose four resolved boolean fields: `nonInteractive`, `yes`, `force`, and `preview`.

#### Scenario: Service provides resolved flag values

- **WHEN** a handler yields `CliFlags`
- **THEN** it receives a `CliFlagsService` with `nonInteractive`, `yes`, `force`, and `preview` as resolved booleans

#### Scenario: yes stores only the explicit flag value

- **WHEN** `--yes` is not passed and `--non-interactive` is active
- **THEN** `flags.yes` SHALL be `false`
- **AND** `flags.nonInteractive` SHALL be `true`

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

### Requirement: Layer Construction from Raw Argv

The `CliFlags` layer SHALL accept raw argv values and resolve them. The `nonInteractive` input SHALL be `Option<boolean>` to distinguish "not passed" from "explicitly false".

#### Scenario: Option.none triggers auto-detection

- **WHEN** the `nonInteractive` input is `Option.none()`
- **THEN** the resolution chain (CI → TTY) SHALL be evaluated

#### Scenario: Option.some bypasses auto-detection

- **WHEN** the `nonInteractive` input is `Option.some(true)` or `Option.some(false)`
- **THEN** the explicit value SHALL be used
- **AND** CI and TTY detection SHALL NOT be evaluated

#### Scenario: Boolean inputs pass through directly

- **WHEN** `yes`, `force`, or `preview` inputs are provided
- **THEN** they SHALL be stored as-is on the resolved service

### Requirement: CliFlags Provided at Runtime Boundary

The `run()` function SHALL construct and provide the `CliFlags` layer. All programs executed through `run()` SHALL have access to the `CliFlags` service.

#### Scenario: run() accepts flag input and provides layer

- **WHEN** a command handler calls `run()` with flag input
- **THEN** the `CliFlags` layer SHALL be constructed from the input
- **AND** the program SHALL be able to yield `CliFlags`

#### Scenario: CliFlags is part of AppLayer

- **WHEN** `AppLayer` is constructed
- **THEN** it SHALL include `CliFlags` as a required service

### Requirement: Prompt Service Non-Interactive Guard

The `ClackPromptService` SHALL depend on `CliFlags` and fail fast with a `CliError` when any prompt method is called in non-interactive mode.

#### Scenario: Prompt called in non-interactive mode fails

- **WHEN** `flags.nonInteractive` is `true`
- **AND** any prompt method is called (text, confirm, select, multiselect, etc.)
- **THEN** the prompt SHALL fail with a `CliError` with code `PROMPT_IN_NON_INTERACTIVE`
- **AND** the error SHALL indicate this is a bug in the handler

#### Scenario: Prompt called in interactive mode proceeds normally

- **WHEN** `flags.nonInteractive` is `false`
- **AND** a prompt method is called
- **THEN** the prompt SHALL render interactively as before

### Requirement: Test Layer Helper

A test helper SHALL provide a `CliFlags` layer with sensible defaults for test environments.

#### Scenario: Default test flags are non-interactive

- **WHEN** a test uses the `CliFlags` test helper without overrides
- **THEN** `nonInteractive` SHALL default to `true`
- **AND** `yes` SHALL default to `false`
- **AND** `force` SHALL default to `false`
- **AND** `preview` SHALL default to `false`

#### Scenario: Test helper accepts overrides

- **WHEN** a test provides partial overrides to the test helper
- **THEN** the overrides SHALL be merged with defaults
