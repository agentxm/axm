## ADDED Requirements

### Requirement: List shows installed commands

`axm commands list` SHALL display a table of installed commands showing name, source, enabled status, and the agents the command is rendered to.

#### Scenario: Table output with installed commands

- **WHEN** user runs `axm commands list`
- **AND** commands `review` and `deploy` are installed
- **THEN** the CLI SHALL display a table with columns for name, source, enabled, and agents

#### Scenario: No installed commands

- **WHEN** user runs `axm commands list`
- **AND** no commands are installed
- **THEN** the CLI SHALL display a message indicating no commands are installed

### Requirement: Scope filter

`axm commands list` SHALL accept `--scope` to show commands from the specified scope. Default SHALL be project scope.

#### Scenario: Project scope listing

- **WHEN** user runs `axm commands list`
- **THEN** commands from the project scope SHALL be displayed

#### Scenario: User scope listing

- **WHEN** user runs `axm commands list --scope user`
- **THEN** commands from the user scope SHALL be displayed

### Requirement: JSON output

`axm commands list --json` SHALL output machine-readable JSON containing the list of installed commands with their metadata.

#### Scenario: JSON output format

- **WHEN** user runs `axm commands list --json`
- **THEN** the output SHALL be valid JSON containing an array of command objects
- **AND** each object SHALL include `name`, `source`, `enabled`, and `agents` fields

### Requirement: Commands parent command

`axm commands` (with no subcommand) SHALL display help listing available subcommands and exit with code 0.

#### Scenario: Parent command shows help

- **WHEN** user runs `axm commands`
- **THEN** the CLI SHALL display help text listing available subcommands (install, uninstall, list, enable, disable, new, publish)
- **AND** SHALL exit with code 0
