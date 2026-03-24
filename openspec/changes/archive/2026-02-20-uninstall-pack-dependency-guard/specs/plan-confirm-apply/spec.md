## MODIFIED Requirements

### Requirement: resolvePlan method on WorkspaceContextService

`WorkspaceContextService` SHALL expose a `resolvePlan<Op>(plan: Plan<Op>, handlers: T)` method that resolves a plan to its terminal state based on the `preview`, `yes`, and `nonInteractive` options provided at service construction.

`resolvePlan` SHALL own all plan display. It SHALL call `displayPlan` at the appropriate points in the resolution flow. Command handlers SHALL NOT render plan output.

`resolvePlan` SHALL return `Plan<Op>`. When the plan is applied, all steps will be `JobStepResult`. When the plan is not applied (cancelled, non-interactive no-op, or blocked by errors), the original plan is returned.

Before evaluating preview/yes/nonInteractive branches, `resolvePlan` SHALL scan all `PlannedJobStep` entries for readiness state and gate execution accordingly.

The resolution algorithm SHALL evaluate branches in this order:

1. **Readiness gate** — scan for errors/warnings before any apply
2. **preview** — display plan, then: `yes` pre-approves apply, `nonInteractive` without `yes` is a no-op with warning, otherwise prompt to confirm
3. **default** — apply, then display results

#### Scenario: Error readiness blocks plan in preview mode

- **WHEN** `resolvePlan` is called with `preview: true` and the plan contains any `PlannedJobStep` with `readiness.status === "error"`
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** `resolvePlan` SHALL fail with an `AppError` with code `PLAN_HAS_ERRORS`
- **AND** the error message SHALL aggregate the messages from all error-readiness steps
- **AND** `applyPlan` SHALL NOT be called

#### Scenario: Error readiness blocks plan in default mode

- **WHEN** `resolvePlan` is called with `preview: false` and the plan contains any `PlannedJobStep` with `readiness.status === "error"`
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** `resolvePlan` SHALL fail with an `AppError` with code `PLAN_HAS_ERRORS`
- **AND** `applyPlan` SHALL NOT be called

#### Scenario: Warning readiness forces confirmation in preview mode

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: false`, `nonInteractive: false`, and the plan contains `PlannedJobStep` steps with `readiness.status === "warn"` but no `"error"` steps
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** a confirmation prompt SHALL ask "Plan has warnings. Continue anyway?"
- **AND** if the user confirms, `applyPlan` SHALL be called
- **AND** if the user declines, the plan SHALL NOT be applied

#### Scenario: Warning readiness forces confirmation even with yes flag

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: true`, `nonInteractive: false`, and the plan contains `PlannedJobStep` steps with `readiness.status === "warn"` but no `"error"` steps
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** a confirmation prompt SHALL ask "Plan has warnings. Continue anyway?"
- **AND** `--yes` SHALL NOT bypass the warning confirmation

#### Scenario: Warning readiness in non-interactive mode fails

- **WHEN** `resolvePlan` is called with `nonInteractive: true`, `yes: false`, and the plan contains `PlannedJobStep` steps with `readiness.status === "warn"`
- **THEN** `resolvePlan` SHALL fail with an `AppError` with code `PLAN_HAS_WARNINGS`
- **AND** `applyPlan` SHALL NOT be called

#### Scenario: Warning readiness forces confirmation in default mode

- **WHEN** `resolvePlan` is called with `preview: false`, `nonInteractive: false`, and the plan contains `PlannedJobStep` steps with `readiness.status === "warn"` but no `"error"` steps
- **THEN** the plan SHALL be displayed via `displayPlan` before apply (opting into preview behavior)
- **AND** a confirmation prompt SHALL ask "Plan has warnings. Continue anyway?"
- **AND** if the user confirms, `applyPlan` SHALL be called and the applied plan SHALL be displayed
- **AND** if the user declines, the plan SHALL NOT be applied

#### Scenario: Preview mode displays plan and prompts to apply

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: false`, `nonInteractive: false`, and no warn/error readiness steps
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** a confirmation prompt SHALL be shown asking "Apply changes?"
- **AND** if the user confirms, `applyPlan` SHALL be called
- **AND** if the user declines, a "Cancelled." message SHALL be shown and the plan SHALL NOT be applied

#### Scenario: Preview with yes pre-approves apply

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: true`, and no warn/error readiness steps
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** no confirmation prompt SHALL be shown
- **AND** `applyPlan` SHALL be called

#### Scenario: Preview with non-interactive and no yes is a no-op

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: false`, `nonInteractive: true`, and no warn/error readiness steps
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** `applyPlan` SHALL NOT be called
- **AND** a warning message SHALL indicate that `--yes` is needed to apply or `--preview` should be removed

#### Scenario: Default mode applies and displays results

- **WHEN** `resolvePlan` is called with `preview: false` and no warn/error readiness steps
- **THEN** `applyPlan` SHALL be called
- **AND** the applied plan SHALL be displayed via `displayPlan`
- **AND** no confirmation prompt SHALL be shown

#### Scenario: Command handler does not display results

- **WHEN** a command handler calls `resolvePlan`
- **THEN** the handler SHALL NOT iterate over results to display them
- **AND** the handler SHALL NOT call the Log service to render success or error messages for individual steps
- **AND** the handler MAY inspect the returned plan for exit code determination
