## MODIFIED Requirements

### Requirement: Init Command

The CLI SHALL provide an `init` command that creates WorkspaceContext to trigger initialization.

#### Scenario: First-time project initialization

- **WHEN** the user runs `axm init` in a directory without `.axm/`
- **THEN** the CLI SHALL detect agents by checking both project-level directories (first segment of each agent's `skills.dir` in cwd) and global directories (`~/.{agent-id}` in home)
- **AND** SHALL present a multiselect of all registered agents with detected agents pre-selected
- **AND** SHALL write selected agents to `.axm/settings.json`

#### Scenario: First-time global initialization

- **WHEN** the user runs `axm init --global` without `~/.axm/`
- **THEN** the CLI creates WorkspaceContext layer which creates empty settings and lockfile

#### Scenario: Already initialized

- **WHEN** the user runs `axm init` and `.axm/settings.json` exists
- **THEN** the CLI displays a message that the project is already initialized

#### Scenario: Non-interactive initialization

- **WHEN** the user runs `axm init --yes`
- **THEN** the CLI SHALL auto-select all detected agents (project-level + global) without prompting

#### Scenario: No agents detected

- **WHEN** the user runs `axm init` in a directory without agent config directories and no matching global directories
- **THEN** the CLI SHALL present a multiselect of all registered agents with none pre-selected

## ADDED Requirements

### Requirement: Agent Detection

The system SHALL detect installed agents by checking two locations per agent.

#### Scenario: Project-level detection

- **WHEN** detecting agents for a project directory
- **THEN** the system SHALL check if the first path segment of each agent's `skills.dir` exists as a directory in cwd
- **AND** SHALL mark matching agents as detected

#### Scenario: Global detection

- **WHEN** detecting agents for a project directory
- **THEN** the system SHALL also check if `~/.{agent-id}` exists as a directory in the user's home
- **AND** SHALL mark matching agents as detected

#### Scenario: Combined detection

- **WHEN** an agent matches either project-level or global detection
- **THEN** the agent SHALL be considered detected (logical OR)

#### Scenario: Shared skills directory

- **WHEN** multiple agents share the same `skills.dir` (e.g., `.agents/skills/`)
- **AND** the shared directory exists in the project
- **THEN** all agents sharing that directory SHALL be detected

#### Scenario: Concurrent detection

- **WHEN** detecting agents across all registered agents
- **THEN** the system SHALL run detection checks concurrently
