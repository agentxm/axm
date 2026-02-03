## ADDED Requirements

### Requirement: Initialize workspace

The `axm init` command SHALL create a workspace at `.axm/settings.json` with the selected agents and default scope.

#### Scenario: Initialize new workspace interactively

- **WHEN** user runs `axm init` in a directory without `.axm/settings.json`
- **AND** multiple agents are detected
- **THEN** system prompts for agent selection with detected agents pre-selected
- **AND** creates `.axm/settings.json` with selected agents and `@community` scope

#### Scenario: Initialize new workspace non-interactively

- **WHEN** user runs `axm init --yes` in a directory without `.axm/settings.json`
- **THEN** system uses all detected agents
- **AND** creates `.axm/settings.json` with detected agents and `@community` scope

#### Scenario: Initialize when no agents detected

- **WHEN** user runs `axm init` in a directory without `.axm/settings.json`
- **AND** no agents are detected on the system
- **THEN** system displays an error indicating no agents were found

### Requirement: Prevent accidental re-initialization

The system SHALL prevent re-initialization of an already initialized workspace unless `--force` is provided.

#### Scenario: Attempt init on initialized workspace

- **WHEN** user runs `axm init` in a directory with valid `.axm/settings.json`
- **THEN** system displays message "This project is already set up. Run with --force to re-initialize."
- **AND** exits without modifying the workspace

#### Scenario: Force re-initialization

- **WHEN** user runs `axm init --force` in a directory with valid `.axm/settings.json`
- **THEN** system proceeds with initialization flow (agent selection or defaults)
- **AND** overwrites `.axm/settings.json` with new configuration

### Requirement: Handle invalid workspace state

The system SHALL error when encountering an invalid workspace configuration.

#### Scenario: Init on invalid workspace

- **WHEN** user runs `axm init` in a directory with `.axm/settings.json` that fails schema validation
- **THEN** system displays an error indicating the workspace is in an invalid state
- **AND** exits without modifying the workspace

### Requirement: Dry-run preview

The `--dry-run` flag SHALL display what initialization would do without making changes.

#### Scenario: Dry-run new workspace

- **WHEN** user runs `axm init --dry-run --yes`
- **AND** workspace is not initialized
- **THEN** system displays the agents that would be configured
- **AND** displays the scope that would be set
- **AND** does not create `.axm/settings.json`

#### Scenario: Dry-run on initialized workspace

- **WHEN** user runs `axm init --dry-run` in a directory with valid `.axm/settings.json`
- **THEN** system displays "No changes. Workspace already initialized."

#### Scenario: Dry-run with force

- **WHEN** user runs `axm init --dry-run --force --yes`
- **AND** workspace is already initialized
- **THEN** system displays the changes that would be made (agents, scope)
- **AND** does not modify `.axm/settings.json`

### Requirement: Settings file format

The generated `.axm/settings.json` SHALL conform to the Settings schema.

#### Scenario: Valid settings structure

- **WHEN** `axm init --yes` completes successfully
- **THEN** `.axm/settings.json` contains valid JSON
- **AND** has `agents` array with selected agent IDs
- **AND** has `scope` set to `@community`
