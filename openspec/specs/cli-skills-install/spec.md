## Requirements

### Requirement: Local Source Recording

The CLI SHALL record the actual local path when installing skills from a local source, using the workspace pipeline.

#### Scenario: Local source in settings

- **WHEN** installing a skill from a local path using `--skill`
- **THEN** the settings file records the source as the absolute path (e.g., `/path/to/skills`) instead of `"*"`

#### Scenario: Local source in lockfile

- **WHEN** installing a skill from a local path using `--skill`
- **THEN** the lockfile records `source: "local"` with a `path` field containing the absolute path

#### Scenario: Consistent with remote sources

- **WHEN** installing a skill from a local path
- **THEN** the source is recorded using the same applyPlan() pattern used for remote sources

### Requirement: Workspace Pipeline Integration

The install handler SHALL use the workspace V2 pipeline for all operations.

#### Scenario: Load current state via workspace

- **WHEN** starting installation
- **THEN** the CLI SHALL call `loadCurrentState(ws)` from `workspace/load-state.ts`
- **AND** the CLI SHALL NOT call legacy `loadSkillsState()` from `skills/state/load.ts`

#### Scenario: Build ideal state via workspace

- **WHEN** processing install request
- **THEN** the CLI SHALL call `buildIdealState()` from `workspace/ideal-state.ts`
- **AND** the CLI SHALL NOT call legacy `buildIdealForInstall()` from `skills/state/ideal.ts`

#### Scenario: Apply plan via workspace

- **WHEN** changes are confirmed
- **THEN** the CLI SHALL call `applyPlan(ws, plan, opts)` from `workspace/apply.ts`
- **AND** the CLI SHALL NOT call legacy `applyDiff()` from `skills/state/apply.ts`

### Requirement: Agent Import Path

The install handler SHALL import agent configuration from the dedicated agents module.

#### Scenario: Agent detection import

- **WHEN** detecting installed agents
- **THEN** the handler SHALL import `detectAgents` from `@agentxm/core/experimental/agents`
- **AND** the handler SHALL NOT import from `@agentxm/core/experimental/skills`

#### Scenario: Agent lookup import

- **WHEN** resolving agent IDs to configurations
- **THEN** the handler SHALL import `getAgentById` from `@agentxm/core/experimental/agents`
- **AND** `getAgentById` SHALL return `Option<AgentConfig>` (not `AgentConfig | undefined`)

### Requirement: Correct Installation Paths

Skills SHALL be installed to paths matching the Agent Skills specification.

#### Scenario: Install to projectDir

- **WHEN** installing a skill to an agent
- **THEN** the skill SHALL be installed to `agent.skills.projectDir` (e.g., `.claude/skills`)
- **AND** the skill SHALL NOT be installed to legacy paths (e.g., `.claude/commands`)

#### Scenario: No path fallback

- **WHEN** determining installation path for an agent
- **THEN** the path SHALL be `agent.skills.projectDir` directly
- **AND** there SHALL be no fallback to `agent.detectPath + "/skills"` pattern
