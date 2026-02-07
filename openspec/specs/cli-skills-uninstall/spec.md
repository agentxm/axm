# cli-skills-uninstall Specification

## Purpose

The `axm skills uninstall` command for removing skills from agent workspaces.

## Requirements

### Requirement: State-Based Uninstall

The CLI SHALL use WorkspaceContext for initialization and the workspace reconciliation pattern for uninstallation.

#### Scenario: WorkspaceContext provides initialization

- **WHEN** starting uninstallation in uninitialized workspace
- **THEN** yielding WorkspaceContext SHALL trigger automatic initialization
- **AND** the handler SHALL NOT contain separate initialization logic

#### Scenario: No OperationContext dependency

- **WHEN** uninstall handler executes
- **THEN** it SHALL NOT yield or depend on OperationContext
- **AND** interactive behavior SHALL be controlled via WorkspaceContext options

#### Scenario: Load current state

- **WHEN** starting uninstallation
- **THEN** the CLI calls `loadCurrentState(ws)` from `workspace/load-state.ts`

#### Scenario: Build ideal state

- **WHEN** processing uninstall request
- **THEN** the CLI calls `buildIdealState()` from `workspace/ideal-state.ts` with target skill removed (from specified agents or all)

#### Scenario: Compute plan

- **WHEN** current and ideal states are ready
- **THEN** the CLI calls `buildPlan()` from `workspace/` to compute the plan

#### Scenario: Resolve plan via workspace

- **WHEN** the plan is built
- **THEN** the handler SHALL call `ws.resolvePlan(plan)` from `WorkspaceContextService`
- **AND** the handler SHALL NOT contain inline plan display, confirm, or apply logic
- **AND** the handler SHALL NOT directly call `applyPlan` or `displayPlan`

### Requirement: Agent Import Path

The uninstall handler SHALL import agent configuration from the dedicated agents module.

#### Scenario: Agent detection import

- **WHEN** detecting installed agents
- **THEN** the handler SHALL import `detectAgents` from `@axm.sh/core/experimental/agents`
- **AND** the handler SHALL NOT import from `@axm.sh/core/experimental/skills`

#### Scenario: Agent lookup import

- **WHEN** resolving agent IDs to configurations
- **THEN** the handler SHALL import `getAgentById` from `@axm.sh/core/experimental/agents`
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

### Requirement: Preview flag in uninstall CLI

The uninstall command SHALL support `--preview` to display the plan without applying.

#### Scenario: Preview flag available

- **WHEN** a user invokes `axm skills uninstall <skill> --preview`
- **THEN** the yargs builder SHALL accept the flag as a boolean option with `default: false`
- **AND** the parsed value SHALL be passed to workspace options as `preview: true`

#### Scenario: Preview flag omitted

- **WHEN** a user invokes `axm skills uninstall <skill>` without `--preview`
- **THEN** workspace options SHALL receive `preview: false`

### Requirement: Non-interactive flag in uninstall CLI

The uninstall command SHALL support `--non-interactive` to disable prompts.

#### Scenario: Non-interactive flag available

- **WHEN** a user invokes `axm skills uninstall <skill> --non-interactive`
- **THEN** the yargs builder SHALL accept the flag as a boolean option (no default)
- **AND** the parsed value SHALL be passed to workspace options as `nonInteractive: true`

#### Scenario: Non-interactive flag omitted

- **WHEN** a user invokes `axm skills uninstall <skill>` without `--non-interactive`
- **THEN** workspace options SHALL receive `nonInteractive: false`
