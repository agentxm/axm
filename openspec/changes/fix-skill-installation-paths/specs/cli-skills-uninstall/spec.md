## MODIFIED Requirements

### Requirement: State-Based Uninstall

The CLI SHALL use the workspace reconciliation pattern for uninstallation.

#### Scenario: Load current state

- **WHEN** starting uninstallation
- **THEN** the CLI calls `loadCurrentState(ws)` from `workspace/load-state.ts`

#### Scenario: Build ideal state

- **WHEN** processing uninstall request
- **THEN** the CLI calls `buildIdealState()` from `workspace/ideal-state.ts` with target skill removed (from specified agents or all)

#### Scenario: Compute plan

- **WHEN** current and ideal states are ready
- **THEN** the CLI calls `buildPlan()` from `workspace/` to compute the plan

#### Scenario: Apply plan via applyPlan

- **WHEN** changes are confirmed
- **THEN** the CLI calls `applyPlan(ws, plan, opts)` to remove skill files, update lockfile, and update settings
- **AND** the handler does NOT call legacy `applyDiff()` from `skills/state/apply.ts`
- **AND** the handler does NOT directly call `removeSkillFromAgents`, `updateSettings`, `removeLockEntry`, or `updateLockEntry`

## ADDED Requirements

### Requirement: Agent Import Path

The uninstall handler SHALL import agent configuration from the dedicated agents module.

#### Scenario: Agent detection import

- **WHEN** detecting installed agents
- **THEN** the handler SHALL import `detectAgents` from `@agentxm/core/experimental/agents`
- **AND** the handler SHALL NOT import from `@agentxm/core/experimental/skills`

#### Scenario: Agent lookup import

- **WHEN** resolving agent IDs to configurations
- **THEN** the handler SHALL import `getAgentById` from `@agentxm/core/experimental/agents`
- **AND** `getAgentById` SHALL return `Option<AgentConfig>` (not `AgentConfig | undefined`)

### Requirement: Correct Uninstallation Paths

Skills SHALL be uninstalled from paths matching the Agent Skills specification.

#### Scenario: Uninstall from projectDir

- **WHEN** uninstalling a skill from an agent
- **THEN** the skill SHALL be removed from `agent.skills.projectDir` (e.g., `.claude/skills`)
- **AND** the skill SHALL NOT be removed from legacy paths (e.g., `.claude/commands`)

#### Scenario: No path fallback

- **WHEN** determining uninstallation path for an agent
- **THEN** the path SHALL be `agent.skills.projectDir` directly
- **AND** there SHALL be no fallback to `agent.detectPath + "/skills"` pattern

### Requirement: Partial Uninstall Path Correction

The partial uninstall bypass path SHALL use correct agent paths.

#### Scenario: Partial uninstall path resolution

- **WHEN** performing partial uninstall (removing from specific agents only)
- **THEN** the path SHALL be determined via `agent.skills.projectDir`
- **AND** the path SHALL NOT use legacy `agent.skillsDir ?? path.join(agent.detectPath, "skills")` fallback
