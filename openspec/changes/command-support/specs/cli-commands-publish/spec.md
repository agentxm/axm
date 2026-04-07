## ADDED Requirements

### Requirement: Validate and publish command

`axm commands publish` SHALL validate the command manifest, pack the command package, and upload it to the registry.

#### Scenario: Successful publish

- **WHEN** user runs `axm commands publish` in a directory with a valid `axm-command.json` and `COMMAND.md`
- **AND** the user is authenticated
- **THEN** the CLI SHALL validate the manifest, pack the directory, upload to the registry, and display a success message with the published name and version

#### Scenario: Missing manifest

- **WHEN** user runs `axm commands publish` in a directory without `axm-command.json`
- **THEN** the CLI SHALL fail with an error indicating no command manifest was found

#### Scenario: Missing command body

- **WHEN** user runs `axm commands publish` in a directory with `axm-command.json` but no `COMMAND.md`
- **THEN** the CLI SHALL fail with an error indicating the command body is missing

#### Scenario: Invalid manifest

- **WHEN** user runs `axm commands publish` with an `axm-command.json` that fails schema validation
- **THEN** the CLI SHALL fail with validation errors before attempting upload

### Requirement: Authentication required

`axm commands publish` SHALL require the user to be authenticated with the target registry.

#### Scenario: Not authenticated

- **WHEN** user runs `axm commands publish`
- **AND** the user is not authenticated
- **THEN** the CLI SHALL fail with an error indicating authentication is required

### Requirement: Publish directory

`axm commands publish` SHALL accept an optional directory argument. If omitted, the current directory SHALL be used.

#### Scenario: Publish from explicit directory

- **WHEN** user runs `axm commands publish ./commands/review`
- **THEN** the CLI SHALL publish the command package from `./commands/review`

#### Scenario: Publish from current directory

- **WHEN** user runs `axm commands publish` without a directory argument
- **THEN** the CLI SHALL publish from the current working directory
