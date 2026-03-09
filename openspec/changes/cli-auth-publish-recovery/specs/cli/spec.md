# cli Delta Specification

## Purpose

Register auth commands as top-level CLI commands.

## MODIFIED Requirements

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

## ADDED Requirements

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
