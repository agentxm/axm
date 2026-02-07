## MODIFIED Requirements

### Requirement: Workspace Pipeline Integration

The install handler SHALL use WorkspaceContext for initialization and workspace access.

#### Scenario: Build plan from operations and lockfile

- **WHEN** processing install request after skill selection
- **THEN** the handler SHALL call the skills-specific `buildPlan(ops, lockfile)` to produce a `Plan<AddSkillOperation>`
- **AND** the handler SHALL NOT construct the plan inline

#### Scenario: Display plan via shared module

- **WHEN** a plan has been built
- **THEN** the handler SHALL call the shared `displayPlan(plan)` from the workspace plan module

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

#### Scenario: Apply plan via shared module

- **WHEN** changes are confirmed (or `--yes` is active)
- **THEN** the handler SHALL call the shared `applyPlan(plan)` from the workspace plan module

#### Scenario: Handler reports results

- **WHEN** plan application completes
- **THEN** the handler SHALL display a summary of installed skills via `clack.outro`
