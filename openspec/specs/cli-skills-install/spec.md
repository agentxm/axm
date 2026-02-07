# cli-skills-install Specification

## Purpose

The `axm skills install` command for installing skills to agent workspaces.

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

The install handler SHALL use WorkspaceContext for initialization and workspace access.

#### Scenario: WorkspaceContext provides initialization

- **WHEN** starting installation in uninitialized workspace
- **THEN** yielding WorkspaceContext SHALL trigger automatic initialization
- **AND** the handler SHALL NOT contain separate initialization logic

#### Scenario: No OperationContext dependency

- **WHEN** install handler executes
- **THEN** it SHALL NOT yield or depend on OperationContext
- **AND** interactive behavior SHALL be controlled via WorkspaceContext options

#### Scenario: Load current state via workspace

- **WHEN** starting installation
- **THEN** the CLI SHALL call `loadCurrentState(ws)` from `workspace/load-state.ts`
- **AND** the CLI SHALL NOT call legacy `loadSkillsState()` from `skills/state/load.ts`

#### Scenario: Build ideal state with operations

- **WHEN** processing install request
- **THEN** the CLI SHALL call `buildIdealState(currentState, operations)` from `workspace/ideal-state.ts`
- **AND** operations SHALL be `AddSkillOperation[]` built from selected skills

#### Scenario: Resolve plan via workspace

- **WHEN** the plan is built
- **THEN** the handler SHALL call `ws.resolvePlan(plan)` from `WorkspaceContextService`
- **AND** the handler SHALL NOT contain inline plan display, confirm, or apply logic
- **AND** the handler SHALL NOT directly call `applyPlan` or `displayPlan`

#### Scenario: Non-interactive flag available in CLI

- **WHEN** a user invokes `axm skills install <source> --non-interactive`
- **THEN** the yargs builder SHALL accept the flag as a boolean option
- **AND** the parsed value SHALL be passed to the handler as `nonInteractive: Option.some(true)`

#### Scenario: Non-interactive flag omitted

- **WHEN** a user invokes `axm skills install <source>` without `--non-interactive`
- **THEN** the parsed value SHALL be `undefined` (no yargs default)
- **AND** the handler SHALL receive `nonInteractive: Option.none()`

#### Scenario: Preview flag available in CLI

- **WHEN** a user invokes `axm skills install <source> --preview`
- **THEN** the yargs builder SHALL accept the flag as a boolean option with `default: false`
- **AND** the parsed value SHALL be passed to workspace options as `preview: true`

#### Scenario: Preview flag omitted

- **WHEN** a user invokes `axm skills install <source>` without `--preview`
- **THEN** the parsed value SHALL default to `false`
- **AND** workspace options SHALL receive `preview: false`

### Requirement: Option-Mapped Flag Boundary Convention

Flags that map to `Option<boolean>` in handler args SHALL NOT have yargs defaults. The yargs builder SHALL omit `default` for these flags so that `undefined` maps to `Option.none()` via `Option.fromNullable`. Flags that map to plain `boolean` in handler args SHALL retain their yargs defaults.

#### Scenario: Boolean flag with default

- **WHEN** a handler arg is typed as `boolean` (e.g., `yes`, `global`, `all`, `force`, `list`, `preview`)
- **THEN** the yargs builder SHALL specify `default: false`

#### Scenario: Option boolean flag without default

- **WHEN** a handler arg is typed as `Option<boolean>` (e.g., `nonInteractive`)
- **THEN** the yargs builder SHALL NOT specify a `default` value
- **AND** `Option.fromNullable` at the boundary SHALL produce `Option.none()` when the flag is omitted

### Requirement: Agent Import Path

The install handler SHALL import agent configuration from the dedicated agents module.

#### Scenario: Agent detection import

- **WHEN** detecting installed agents
- **THEN** the handler SHALL import `detectAgents` from `@axm.sh/core/experimental/agents`
- **AND** the handler SHALL NOT import from `@axm.sh/core/experimental/skills`

#### Scenario: Agent lookup import

- **WHEN** resolving agent IDs to configurations
- **THEN** the handler SHALL import `getAgentById` from `@axm.sh/core/experimental/agents`
- **AND** `getAgentById` SHALL return `Option<AgentConfig>` (not `AgentConfig | undefined`)

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

### Requirement: Agent Selection from Settings

The install handler SHALL use agents from workspace settings.

#### Scenario: Agents from settings

- **WHEN** install handler executes without `--agent` flag
- **THEN** agents SHALL be read from workspace settings (configured during init)
- **AND** the handler SHALL NOT prompt for agent selection

### Requirement: Unified Source type

The system SHALL use a single `Source` type (from `sources/types.ts`) for all source representation — parsing, operations, state, lockfile, and settings.

#### Scenario: State types use Source

- **WHEN** defining `IdealSkillV2`, `LockedSkillV2`, or any state type that references a skill's origin
- **THEN** the `source` field SHALL be of type `Source` (from `sources/types.ts`)
- **AND** there SHALL be no `SkillSourceV2` type

#### Scenario: Lockfile preserves all source variants

- **WHEN** writing a skill to the lockfile
- **THEN** the lockfile entry SHALL preserve the full source variant (github, gitlab, bitbucket, azurerepos, git, registry, local)
- **AND** gitlab/bitbucket sources SHALL NOT be collapsed to local

#### Scenario: Lockfile reads all source variants

- **WHEN** reading a skill from the lockfile
- **THEN** `parseSourceFromEntry` SHALL return `Source`
- **AND** it SHALL handle all source discriminators including `gitlab`, `bitbucket`, `azurerepos`, `git`

### Requirement: WorkspaceOperation types

The workspace module SHALL define atomic per-skill operation types for building ideal state.

#### Scenario: AddSkillOperation shape

- **WHEN** constructing an add-skill operation
- **THEN** it SHALL have `_tag: "add-skill"`, `source: Source`, `agents: ReadonlyArray<string>`, `skill: DiscoveredSkill`, and `force: boolean`

#### Scenario: RemoveSkillOperation shape

- **WHEN** constructing a remove-skill operation
- **THEN** it SHALL have `_tag: "remove-skill"` and `name: string`

#### Scenario: WorkspaceOperation union

- **WHEN** defining the WorkspaceOperation type
- **THEN** it SHALL be a discriminated union of `AddSkillOperation | RemoveSkillOperation`

### Requirement: buildIdealState as operation fold

The `buildIdealState` function SHALL compute ideal state by folding operations over current state.

#### Scenario: Signature

- **WHEN** calling `buildIdealState`
- **THEN** it SHALL accept `(current: CurrentState, ops: ReadonlyArray<WorkspaceOperation>)`
- **AND** it SHALL return `Effect<IdealState, CommandError>`

#### Scenario: Add-skill applies to ideal state

- **WHEN** folding an `add-skill` operation
- **THEN** the skill SHALL be added to ideal state with the operation's source, agents, version, and gitTreeHash
- **AND** if a skill with the same name exists, it SHALL be replaced

#### Scenario: Add-skill conflict detection

- **WHEN** folding an `add-skill` operation for a skill that exists from a different source
- **AND** `force` is false
- **THEN** `buildIdealState` SHALL fail with `CommandError`

#### Scenario: Add-skill force replaces from different source

- **WHEN** folding an `add-skill` operation for a skill that exists from a different source
- **AND** `force` is true
- **THEN** the skill SHALL be replaced in ideal state

#### Scenario: Remove-skill removes from ideal state

- **WHEN** folding a `remove-skill` operation
- **THEN** the named skill SHALL be removed from ideal state

#### Scenario: Remove-skill for non-existent skill

- **WHEN** folding a `remove-skill` operation for a skill not in current state
- **THEN** `buildIdealState` SHALL fail with `CommandError`

#### Scenario: Empty operations preserves current state

- **WHEN** folding an empty operations array
- **THEN** ideal state SHALL match current state (all locked skills preserved)

### Requirement: Handler uses Source directly

The install handler SHALL use the `Source` type from `parseSource` directly on operations without conversion.

#### Scenario: No source conversion

- **WHEN** building `AddSkillOperation` from selected skills
- **THEN** the handler SHALL use the `Source` value from `parseSource` directly as the operation's `source`
- **AND** there SHALL be no `sourceToV2`, `toSkillSourceV2`, or equivalent conversion function

#### Scenario: Handler calls buildIdealState with operations

- **WHEN** building ideal state
- **THEN** the handler SHALL call `buildIdealState(currentState, operations)`
- **AND** it SHALL NOT call `buildIdealForInstall`
