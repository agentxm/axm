## ADDED Requirements

### Requirement: Enable re-renders to agents

`axm commands enable` SHALL set `enabled: true` in the command's settings entry and re-render the command to all configured agents.

#### Scenario: Enable a disabled command

- **WHEN** user runs `axm commands enable review`
- **AND** `review` is installed with `enabled: false`
- **THEN** the CLI SHALL set `enabled: true` in `settings.json`
- **AND** SHALL render the command to all configured agents' command directories
- **AND** SHALL update the lockfile `agents` array

#### Scenario: Already enabled is a no-op

- **WHEN** user runs `axm commands enable review`
- **AND** `review` is already enabled
- **THEN** the CLI SHALL complete with a success message indicating the command is already enabled

#### Scenario: Command not found

- **WHEN** user runs `axm commands enable unknown-cmd`
- **AND** `unknown-cmd` is not installed
- **THEN** the CLI SHALL fail with an error indicating the command is not installed

### Requirement: Scope flag

`axm commands enable` SHALL accept `--scope` to target the correct scope. Default SHALL be project scope.

#### Scenario: Enable in user scope

- **WHEN** user runs `axm commands enable review --scope user`
- **THEN** the CLI SHALL enable the command in user-scope settings and render to user-level agent directories
