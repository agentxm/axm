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

#### Scenario: Build ideal state via workspace

- **WHEN** processing install request
- **THEN** the CLI SHALL call `buildIdealState()` from `workspace/ideal-state.ts`
- **AND** the CLI SHALL NOT call legacy `buildIdealForInstall()` from `skills/state/ideal.ts`

#### Scenario: Apply plan via workspace

- **WHEN** changes are confirmed
- **THEN** the CLI SHALL call `applyPlan(ws, plan, opts)` from `workspace/apply.ts`
- **AND** the CLI SHALL NOT call legacy `applyDiff()` from `skills/state/apply.ts`

## REMOVED Requirements

### Requirement: Agent Selection in Install Handler

**Reason**: Agent selection moved to WorkspaceContext initialization
**Migration**: Agents are selected during WorkspaceContext creation; install handler uses agents from settings
