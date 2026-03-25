## REMOVED Requirements

### Requirement: CliEnvironment Service Interface

**Reason**: `CliEnvironment` is removed. Its responsibilities are absorbed: verbose/debug move to the `Verbosity` service, nonInteractive moves to a `nonInteractiveFlag` GlobalFlag setting resolved at the prompt layer boundary.
**Migration**: Replace `yield* CliEnvironment` with `yield* Verbosity` for verbosity checks. Non-interactive behavior is handled by the `CliPrompt` layer internally.

### Requirement: Verbose Resolution Chain

**Reason**: Moved to `Verbosity` service. Four-level verbosity (`quiet`/`normal`/`verbose`/`debug`) replaces boolean `verbose` flag.
**Migration**: Use `Verbosity` service with `isAtLeast("verbose")` instead of checking `flags.verbose`.

### Requirement: Debug Resolution Chain

**Reason**: Moved to `Verbosity` service. Debug is one of four verbosity levels, not a separate boolean.
**Migration**: Use `Verbosity` service with `isAtLeast("debug")` instead of checking `flags.debug`.

### Requirement: Layer Construction

**Reason**: `makeCliEnvironmentLayer` is removed. Layer construction is split across `makeVerbosityLayer` and the prompt layer boundary.
**Migration**: Use `makeVerbosityLayer(level)` for verbosity. Non-interactive resolution happens at the prompt layer boundary.

### Requirement: Layer accepts env var overrides for verbosity

**Reason**: Removed. Verbosity is resolved from argv at the `run()` boundary. Env var overrides (`AXM_VERBOSE`, `AXM_DEBUG`) can be checked during argv resolution if needed.
**Migration**: Integrate env var checks into `resolveVerbosityFromArgv` if required.

### Requirement: CliEnvironment Provided at Runtime Boundary

**Reason**: Removed. `CliEnvironment` no longer exists. The `run()` boundary provides `Verbosity`, `CliRenderer`, and `CliPrompt` instead.
**Migration**: `run()` constructs `makeFoundationLayer({ json, terminalCapabilities })` providing `CliRenderer | CliPrompt | Verbosity`.

### Requirement: Test Layer Helper

**Reason**: `CliEnvironmentTest` is removed. Test configuration is split across `TestRenderer`, `TestPrompt`, and `makeVerbosityLayer`.
**Migration**: Provide `makeVerbosityLayer("normal")` in tests for verbosity. Use `TestRenderer` and `TestPrompt` for output and prompt testing.

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

### Requirement: Per-Command Flags Threaded via Handler Args

Per-command flags (`yes`, `force`, `preview`, `json`) SHALL NOT be part of any service. They are defined as reusable `Flag` definitions and passed as explicit parameters to handler functions.

#### Scenario: Handler receives per-command flags as function parameters

- **WHEN** a command declares `--yes`, `--force`, `--preview`, or `--json` flags
- **THEN** the command boundary SHALL pass their values to the handler as function arguments
- **AND** the handler SHALL NOT read them from any service

### Requirement: Prompt Service Non-Interactive Guard

The `CliPrompt` service SHALL fail fast with an `AppError` when a prompt method is called in non-interactive mode and no default value is available. When non-interactive with a default, the default SHALL be used silently.

#### Scenario: Prompt called in non-interactive mode without default fails

- **WHEN** the session is non-interactive
- **AND** a prompt method is called without a default value
- **THEN** the prompt SHALL fail with an `AppError` with code `PROMPT_REQUIRED`
- **AND** the error SHALL suggest the equivalent flag to pass

#### Scenario: Prompt called in non-interactive mode with default succeeds

- **WHEN** the session is non-interactive
- **AND** a prompt method is called with a default value
- **THEN** the prompt SHALL return the default value silently

#### Scenario: Prompt called in interactive mode proceeds normally

- **WHEN** the session is interactive
- **AND** a prompt method is called
- **THEN** the prompt SHALL render interactively

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
