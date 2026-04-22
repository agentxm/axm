## MODIFIED Requirements

### Requirement: Agent detection includes subagent directories

The system SHALL detect installed agents by checking subagent directories in addition to skill and command directories. The system SHALL NOT count the universal skills directory (`.agents/skills`) as an agent-specific detection signal — agents whose only filesystem footprint is the first path segment of the universal skills directory SHALL NOT be considered detected.

#### Scenario: Project-level detection via subagents directory

- **WHEN** detecting agents for a project directory
- **THEN** the system SHALL check if each agent's subagents directory (first path segment) exists as a directory in cwd
- **AND** SHALL mark matching agents as detected

#### Scenario: Agent detected by subagents directory alone

- **WHEN** an agent has a subagents directory (e.g., `.gemini/agents/`) but no skills or commands directory
- **AND** `.gemini/` exists in the project
- **THEN** the agent SHALL be considered detected

#### Scenario: Concurrent detection includes subagent directories

- **WHEN** detecting agents across all registered agents
- **THEN** the system SHALL run detection checks concurrently across skills dirs, command dirs, subagent dirs, and user dirs

#### Scenario: Universal-dir-only agent not auto-detected

- **WHEN** detecting agents for a project directory
- **AND** agent `amp` has `skills.dir` of `.agents/skills` and no commands or subagents dirs
- **AND** `.agents/` exists on disk
- **THEN** `amp` SHALL NOT appear in the detected agents list
- **AND** SHALL NOT be pre-checked in the interactive multiselect during `axm init`

#### Scenario: Universal-dir agent with additional signal detected

- **WHEN** detecting agents for a project directory
- **AND** an agent has `skills.dir` of `.agents/skills` and `commands.dir` of `.foo/commands`
- **AND** `.foo/` exists on disk
- **THEN** the agent SHALL be detected via its commands dir
