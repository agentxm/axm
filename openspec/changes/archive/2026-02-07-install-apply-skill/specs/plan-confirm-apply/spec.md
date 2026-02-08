## MODIFIED Requirements

### Requirement: resolvePlan method on WorkspaceContextService

`WorkspaceContextService` SHALL expose a `resolvePlan` method that accepts a `Plan<Op>` and an `Executors<Op, E, R>` registry, resolving a plan to its terminal state based on the `preview`, `yes`, and `nonInteractive` options provided at service construction.

The resolution algorithm SHALL evaluate branches in this order:

1. **preview** — log preview mode, display plan, then: `yes` pre-approves apply, `nonInteractive` without `yes` is a no-op with warning, otherwise prompt to confirm
2. **default** — display plan, then apply immediately

#### Scenario: Preview mode logs, displays plan, and prompts to apply

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: false`, and `nonInteractive: false`
- **THEN** a log message SHALL indicate preview mode (e.g., "Previewing changes...")
- **AND** the plan SHALL be displayed via `displayPlan`
- **AND** a confirmation prompt SHALL be shown asking "Apply changes?"
- **AND** if the user confirms, `applyPlan` SHALL be called with the plan and executor registry
- **AND** if the user declines, a "Cancelled." outro SHALL be shown and `applyPlan` SHALL NOT be called

#### Scenario: Preview with yes pre-approves apply

- **WHEN** `resolvePlan` is called with `preview: true` and `yes: true`
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** no confirmation prompt SHALL be shown
- **AND** a log message SHALL indicate the apply was pre-approved (e.g., "Pre-approved via --yes, applying changes...")
- **AND** `applyPlan` SHALL be called with the plan and executor registry

#### Scenario: Preview with non-interactive and no yes is a no-op

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: false`, and `nonInteractive: true`
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** `applyPlan` SHALL NOT be called
- **AND** no confirmation prompt SHALL be shown
- **AND** a warning message SHALL indicate that `--yes` is needed to apply or `--preview` should be removed (e.g., "Cannot prompt in non-interactive mode. Use --yes to apply, or remove --preview.")

#### Scenario: Default mode displays plan and applies

- **WHEN** `resolvePlan` is called with `preview: false`
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** `applyPlan` SHALL be called with the plan and executor registry immediately after display
- **AND** no confirmation prompt SHALL be shown

#### Scenario: Executor registry forwarded to applyPlan

- **WHEN** `resolvePlan` calls `applyPlan`
- **THEN** it SHALL pass the `executors` registry received from the caller
