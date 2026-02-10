## ADDED Requirements

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

## MODIFIED Requirements

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

#### Scenario: Apply plan via workspace

- **WHEN** changes are confirmed
- **THEN** the CLI SHALL call `applyPlan(ws, plan, opts)` from `workspace/apply.ts`
- **AND** the CLI SHALL NOT call legacy `applyDiff()` from `skills/state/apply.ts`

## REMOVED Requirements

### Requirement: BuildIdealDeps for install

**Reason**: Operations carry pre-resolved data. `buildIdealState` folds operations without needing external deps.

**Migration**: Remove `BuildIdealDeps`, `BuildIdealStateDeps`, `SkillSourceV2`. Remove `InstallCommand`, `UninstallCommand` types. Use `WorkspaceOperation` union and `Source` type instead.
