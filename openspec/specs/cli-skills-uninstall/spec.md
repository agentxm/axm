## Requirements

### Requirement: State-Based Uninstall

The CLI SHALL use WorkspaceContext for initialization and the workspace reconciliation pattern for uninstallation. The handler flow SHALL be: load configured skills, check managed flag, then either remove the unmanaged marker directly or build a plan for managed skills.

#### Scenario: Resolve plan via workspace

- **WHEN** the plan is built for a managed skill
- **THEN** the handler SHALL call `ws.resolvePlan(plan, handlers)` from `WorkspaceContextService`
- **AND** the handler SHALL NOT contain inline plan display, confirm, or apply logic
- **AND** the handler SHALL NOT directly call `applyPlan` or `displayPlan`

#### Scenario: Handler does not display results

- **WHEN** `resolvePlan` returns the applied plan
- **THEN** the handler SHALL NOT iterate over steps to display success or error messages
- **AND** result display SHALL be handled entirely by `resolvePlan` via `displayPlan`

#### Scenario: Glob pattern expands before building operations

- **WHEN** the user provides a skill name containing `*`
- **THEN** the handler SHALL expand the pattern against lockfile keys before building `UninstallSkillOperation`s
- **AND** each matched skill name SHALL produce one `UninstallSkillOperation`

#### Scenario: Literal skill name not in lockfile

- **WHEN** the user provides a literal skill name (no `*`) not present in the lockfile
- **THEN** the handler SHALL still build a `UninstallSkillOperation` for it
- **AND** the plan builder SHALL mark it as `no-op`

#### Scenario: Glob pattern matches no skills

- **WHEN** a glob pattern matches zero skills in the lockfile
- **THEN** the handler SHALL display a message that no skills matched the pattern
- **AND** SHALL NOT build an empty plan

#### Scenario: Unmanaged skill uninstall bypasses plan system

- **WHEN** the user runs `axm skills uninstall <name>` and the skill has `managed: false`
- **THEN** the handler SHALL skip the plan system entirely
- **AND** remove the settings marker via `ws.removeSkill(name)`
- **AND** log a message (e.g., "Removed unmanaged skill marker '<name>'")
- **AND** return without building a plan

## Requirements

### Requirement: UninstallSkillArgs includes optional agent filter

The `UninstallSkillArgs` type SHALL include an optional `agents` field (`ReadonlyArray<string>`) for partial uninstall support. When empty, the operation targets all agents.

#### Scenario: No agent filter

- **WHEN** the `--agent` flag is not provided
- **THEN** `UninstallSkillArgs.agents` SHALL be an empty array
- **AND** the operation handler SHALL remove from all agents listed in the lockfile entry

#### Scenario: Agent filter provided

- **WHEN** the `--agent` flag is provided with one or more agent IDs
- **THEN** `UninstallSkillArgs.agents` SHALL contain those agent IDs
- **AND** the operation handler SHALL only remove from the specified agents
