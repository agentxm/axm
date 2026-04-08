# cli-commands-disable Specification

## Purpose

The `axm commands disable` command disables an enabled command and removes its rendered files from agents.

## Requirements

### Requirement: Disable removes rendered files

`axm commands disable` SHALL set `enabled: false` in the command's settings entry and remove rendered command files from all agents.

#### Scenario: Disable an enabled command

- **WHEN** user runs `axm commands disable review`
- **AND** `review` is installed and enabled
- **THEN** the CLI SHALL set `enabled: false` in `settings.json`
- **AND** SHALL remove the rendered command files from all agents listed in the lockfile `agents` array
- **AND** SHALL clear the lockfile `agents` array

#### Scenario: Already disabled is a no-op

- **WHEN** user runs `axm commands disable review`
- **AND** `review` is already disabled
- **THEN** the CLI SHALL complete with a success message indicating the command is already disabled

#### Scenario: Command not found

- **WHEN** user runs `axm commands disable unknown-cmd`
- **AND** `unknown-cmd` is not installed
- **THEN** the CLI SHALL fail with an error indicating the command is not installed

### Requirement: Materialized files preserved

Disabling a command SHALL NOT remove the materialized command package from `.axm/extensions/`. Only the rendered agent files SHALL be removed.

#### Scenario: Package preserved on disable

- **WHEN** user runs `axm commands disable review`
- **THEN** `.axm/extensions/@acme/commands/review/` SHALL remain intact
- **AND** only the rendered files in agent directories SHALL be removed

### Requirement: Scope flag

`axm commands disable` SHALL accept `--scope` to target the correct scope. Default SHALL be project scope.

#### Scenario: Disable in user scope

- **WHEN** user runs `axm commands disable review --scope user`
- **THEN** the CLI SHALL disable the command in user-scope settings and remove rendered files from user-level agent directories
