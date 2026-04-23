## MODIFIED Requirements

### Requirement: Agent detection includes subagent directories

The system SHALL detect installed agents by checking subagent directories in addition to skill and command directories.

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

### Requirement: Setup notes existing subagent files

When subagents are already present in agent-native directories, setup SHALL note their existence in output. Setup SHALL NOT attempt to import or convert them (that is a follow-on `import` command).

#### Scenario: Existing subagent files noted

- **WHEN** `axm setup` is run
- **AND** `.claude/agents/code-reviewer.md` exists (without AXM managed header)
- **THEN** setup SHALL note that existing subagent files were found
- **AND** SHALL NOT modify or import them

#### Scenario: AXM-managed subagent files recognized

- **WHEN** `axm setup` is run
- **AND** `.claude/agents/code-reviewer.md` exists with the AXM managed header
- **THEN** setup SHALL recognize these as AXM-managed and include them in the existing configuration summary
