## ADDED Requirements

### Requirement: Extensions Init Sub-command

The CLI SHALL provide an `extensions init` sub-command that initializes the
workspace for extension management.

#### Scenario: Initialize new workspace

- **WHEN** the user runs `axm extensions init` in a directory without `.axm/`
- **THEN** the CLI creates `.axm/settings.json` with default configuration
- **AND** displays "Workspace initialized" confirmation message

#### Scenario: Initialize with custom path

- **WHEN** the user runs `axm extensions init ./my-project`
- **THEN** the CLI creates `.axm/settings.json` at the specified path
- **AND** displays "Workspace initialized" confirmation message

#### Scenario: Initialize with publisher option

- **WHEN** the user runs `axm extensions init --publisher @myorg`
- **THEN** the CLI creates `.axm/settings.json` with `publisher` set to `@myorg`

#### Scenario: Initialize with yes flag

- **WHEN** the user runs `axm extensions init -y`
- **THEN** the CLI skips interactive prompts and uses default values

#### Scenario: Initialize already-initialized workspace

- **WHEN** the user runs `axm extensions init` in a directory that already has `.axm/settings.json`
- **THEN** the CLI preserves existing configuration
- **AND** displays "Workspace already initialized" status message
