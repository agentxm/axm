# cli-init Specification

## Purpose

The `axm init` command for initializing workspaces. Acts as a thin wrapper around WorkspaceContext creation.

## Requirements

### Requirement: Init Command

The CLI SHALL provide an `init` command that creates WorkspaceContext to trigger initialization.

#### Scenario: First-time project initialization

- **WHEN** the user runs `axm init` in a directory without `.axm/`
- **THEN** the CLI creates WorkspaceContext layer which triggers agent detection and selection

#### Scenario: First-time global initialization

- **WHEN** the user runs `axm init --global` without `~/.axm/`
- **THEN** the CLI creates WorkspaceContext layer which creates empty settings and lockfile

#### Scenario: Already initialized

- **WHEN** the user runs `axm init` and `.axm/settings.json` exists
- **THEN** the CLI displays a message that the project is already initialized

#### Scenario: Non-interactive initialization

- **WHEN** the user runs `axm init --yes`
- **THEN** the CLI creates WorkspaceContext with `yes=true` which auto-selects detected agents

### Requirement: Init Command Flags

The CLI SHALL support flags for controlling initialization behavior.

#### Scenario: Global flag

- **WHEN** the user runs `axm init --global`
- **THEN** WorkspaceContext is created with `global=true`

#### Scenario: Yes flag

- **WHEN** the user runs `axm init --yes`
- **THEN** WorkspaceContext is created with `yes=true`

#### Scenario: Non-interactive flag

- **WHEN** the user runs `axm init --non-interactive`
- **THEN** WorkspaceContext is created with `nonInteractive=true`

#### Scenario: Agent flag

- **WHEN** the user runs `axm init --agent claude-code cursor`
- **THEN** WorkspaceContext is created with specified agents without detection or prompting

### Requirement: Reusable Init Logic

The init logic SHALL be provided by WorkspaceContext factory.

#### Scenario: Init as WorkspaceContext creation

- **WHEN** implementing the init functionality
- **THEN** it SHALL be a thin wrapper that yields WorkspaceContext and displays result

#### Scenario: No duplicate init logic

- **WHEN** init command runs
- **THEN** it SHALL NOT contain agent detection, selection, or file creation logic
- **AND** all such logic SHALL be in WorkspaceContext.make()
