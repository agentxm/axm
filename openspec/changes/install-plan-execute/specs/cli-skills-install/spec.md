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

#### Scenario: Build plan from operations and lockfile

- **WHEN** processing install request after skill selection
- **THEN** the handler SHALL call `buildPlan(ops, lockfile)` from `install/build-plan.ts`
- **AND** the handler SHALL NOT construct the plan inline

#### Scenario: Display plan

- **WHEN** a plan has been built
- **THEN** the handler SHALL call `displayPlan(plan)` from `install/display-plan.ts`

#### Scenario: Dry-run stops after display

- **WHEN** `--dry-run` is active
- **THEN** the handler SHALL display the plan and exit without applying

#### Scenario: Confirm before apply

- **WHEN** `--dry-run` is not active and `--yes` is not active
- **THEN** the handler SHALL prompt the user to confirm before applying the plan
- **AND** if the user declines, the handler SHALL exit without applying

#### Scenario: Yes skips confirmation

- **WHEN** `--yes` is active and `--dry-run` is not active
- **THEN** the handler SHALL apply the plan without prompting for confirmation

#### Scenario: Apply plan

- **WHEN** changes are confirmed (or `--yes` is active)
- **THEN** the handler SHALL call `applyPlan(plan, ws)` from `install/apply-plan.ts`

#### Scenario: Handler reports results

- **WHEN** plan application completes
- **THEN** the handler SHALL display a summary of installed skills via `clack.outro`
