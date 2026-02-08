## Requirements

### Requirement: resolvePlan method on WorkspaceContextService

`WorkspaceContextService` SHALL expose a `resolvePlan<Op>(plan: Plan<Op>, handlers: T)` method that resolves a plan to its terminal state based on the `preview`, `yes`, and `nonInteractive` options provided at service construction.

`resolvePlan` SHALL own all plan display. It SHALL call `displayPlan` before application (showing expected results) and after application (showing actual results). Command handlers SHALL NOT render plan output.

`resolvePlan` SHALL return `Plan<Op>`. When the plan is applied, all steps will be `JobStepResult`. When the plan is not applied (cancelled or non-interactive no-op), the original plan with `PlannedJobStep` steps is returned.

The resolution algorithm SHALL evaluate branches in this order:

1. **preview** — display plan, then: `yes` pre-approves apply, `nonInteractive` without `yes` is a no-op with warning, otherwise prompt to confirm
2. **default** — display plan, apply, display results

#### Scenario: Preview mode displays plan and prompts to apply

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: false`, and `nonInteractive: false`
- **THEN** the plan SHALL be displayed via `displayPlan` (showing `expectedResult`)
- **AND** a confirmation prompt SHALL be shown asking "Apply changes?"
- **AND** if the user confirms, `applyPlan` SHALL be called and the applied plan SHALL be displayed via `displayPlan` (showing `actualResult`)
- **AND** if the user declines, a "Cancelled." outro SHALL be shown, `applyPlan` SHALL NOT be called, and the unapplied plan SHALL be returned

#### Scenario: Preview with yes pre-approves apply

- **WHEN** `resolvePlan` is called with `preview: true` and `yes: true`
- **THEN** the plan SHALL be displayed via `displayPlan` (showing `expectedResult`)
- **AND** no confirmation prompt SHALL be shown
- **AND** `applyPlan` SHALL be called and the applied plan SHALL be displayed via `displayPlan` (showing `actualResult`)

#### Scenario: Preview with non-interactive and no yes is a no-op

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: false`, and `nonInteractive: true`
- **THEN** the plan SHALL be displayed via `displayPlan` (showing `expectedResult`)
- **AND** `applyPlan` SHALL NOT be called
- **AND** no confirmation prompt SHALL be shown
- **AND** a warning message SHALL indicate that `--yes` is needed to apply or `--preview` should be removed
- **AND** the unapplied plan SHALL be returned

#### Scenario: Default mode displays plan, applies, and displays results

- **WHEN** `resolvePlan` is called with `preview: false`
- **THEN** the plan SHALL be displayed via `displayPlan` (showing `expectedResult`)
- **AND** `applyPlan` SHALL be called immediately after display
- **AND** the applied plan SHALL be displayed via `displayPlan` (showing `actualResult`)
- **AND** no confirmation prompt SHALL be shown

#### Scenario: Command handler does not display results

- **WHEN** a command handler calls `resolvePlan`
- **THEN** the handler SHALL NOT iterate over results to display them
- **AND** the handler SHALL NOT call Clack to render success or error messages for individual steps
- **AND** the handler MAY inspect the returned plan for exit code determination
