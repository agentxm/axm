## MODIFIED Requirements

### Requirement: Correct Installation Paths

Skills SHALL be installed to paths matching the Agent Skills specification.

#### Scenario: Install to agent skills dir

- **WHEN** installing a skill to an agent
- **THEN** the skill SHALL be installed to `agent.skills.dir` (e.g., `.claude/skills`)
- **AND** the skill SHALL NOT be installed to legacy paths (e.g., `.claude/commands`)

#### Scenario: No path fallback

- **WHEN** determining installation path for an agent
- **THEN** the path SHALL be `agent.skills.dir` directly
- **AND** there SHALL be no fallback to `agent.detectPath + "/skills"` pattern
