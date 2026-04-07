## MODIFIED Requirements

### Requirement: Agent Detection

The system SHALL detect installed agents by checking two locations per agent, including both skill directories and command directories.

#### Scenario: Project-level detection via skills directory

- **WHEN** detecting agents for a project directory
- **THEN** the system SHALL check if the first path segment of each agent's `skills.dir` exists as a directory in cwd
- **AND** SHALL mark matching agents as detected

#### Scenario: Project-level detection via commands directory

- **WHEN** detecting agents for a project directory
- **THEN** the system SHALL also check if each agent's commands directory (first path segment) exists as a directory in cwd
- **AND** SHALL mark matching agents as detected

#### Scenario: User-level detection

- **WHEN** detecting agents for a project directory
- **THEN** the system SHALL also check if `~/.{agent-id}` exists as a directory in the user's home
- **AND** SHALL mark matching agents as detected

#### Scenario: Combined detection includes command directories

- **WHEN** an agent has a commands directory (e.g., `.gemini/commands/`) but no skills directory
- **AND** `.gemini/` exists in the project
- **THEN** the agent SHALL be considered detected

#### Scenario: Concurrent detection

- **WHEN** detecting agents across all registered agents
- **THEN** the system SHALL run detection checks concurrently (skills dirs, command dirs, and user dirs)
