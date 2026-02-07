# plan-confirm-apply Specification

## Purpose

Plan resolution workflow that consolidates plan display, confirmation, and application logic in WorkspaceContextService.

## Requirements

### Requirement: resolvePlan method on WorkspaceContextService

`WorkspaceContextService` SHALL expose a `resolvePlan<Op>(plan: Plan<Op>)` method that resolves a plan to its terminal state based on the `preview`, `yes`, and `nonInteractive` options provided at service construction.

The resolution algorithm SHALL evaluate branches in this order:

1. **preview** — log preview mode, display plan, then: `yes` pre-approves apply, `nonInteractive` without `yes` is a no-op with warning, otherwise prompt to confirm
2. **default** — display plan, then apply immediately

#### Scenario: Preview mode logs, displays plan, and prompts to apply

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: false`, and `nonInteractive: false`
- **THEN** a log message SHALL indicate preview mode (e.g., "Previewing changes...")
- **AND** the plan SHALL be displayed via `displayPlan`
- **AND** a confirmation prompt SHALL be shown asking "Apply changes?"
- **AND** if the user confirms, `applyPlan` SHALL be called
- **AND** if the user declines, a "Cancelled." outro SHALL be shown and `applyPlan` SHALL NOT be called

#### Scenario: Preview with yes pre-approves apply

- **WHEN** `resolvePlan` is called with `preview: true` and `yes: true`
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** no confirmation prompt SHALL be shown
- **AND** a log message SHALL indicate the apply was pre-approved (e.g., "Pre-approved via --yes, applying changes...")
- **AND** `applyPlan` SHALL be called

#### Scenario: Preview with non-interactive and no yes is a no-op

- **WHEN** `resolvePlan` is called with `preview: true`, `yes: false`, and `nonInteractive: true`
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** `applyPlan` SHALL NOT be called
- **AND** no confirmation prompt SHALL be shown
- **AND** a warning message SHALL indicate that `--yes` is needed to apply or `--preview` should be removed (e.g., "Cannot prompt in non-interactive mode. Use --yes to apply, or remove --preview.")

#### Scenario: Default mode displays plan and applies

- **WHEN** `resolvePlan` is called with `preview: false`
- **THEN** the plan SHALL be displayed via `displayPlan`
- **AND** `applyPlan` SHALL be called immediately after display
- **AND** no confirmation prompt SHALL be shown

### Requirement: nonInteractive resolved to boolean on service

`WorkspaceContextService` SHALL expose `nonInteractive` as a plain `boolean`, resolved once at construction from the `Option<boolean>` input and CI/CD environment detection.

#### Scenario: Explicit flag true

- **WHEN** constructing `WorkspaceContextService` with `nonInteractive: Option.some(true)`
- **THEN** `service.nonInteractive` SHALL be `true`

#### Scenario: Explicit flag false overrides CI

- **WHEN** constructing `WorkspaceContextService` with `nonInteractive: Option.some(false)`
- **AND** `process.env.CI` equals `"true"`
- **THEN** `service.nonInteractive` SHALL be `false` (explicit flag takes precedence)

#### Scenario: No flag with CI environment

- **WHEN** constructing `WorkspaceContextService` with `nonInteractive: Option.none()`
- **AND** `process.env.CI` equals `"true"`
- **THEN** `service.nonInteractive` SHALL be `true`

#### Scenario: No flag without CI environment

- **WHEN** constructing `WorkspaceContextService` with `nonInteractive: Option.none()`
- **AND** `process.env.CI` is not set or not `"true"`
- **THEN** `service.nonInteractive` SHALL be `false`

### Requirement: WorkspaceContextOptions includes preview

`WorkspaceContextOptions` SHALL include a `preview: boolean` field alongside `yes` and `nonInteractive`.

#### Scenario: preview in options

- **WHEN** constructing a `WorkspaceContextService` via `layer(options)`
- **THEN** `options` SHALL accept `preview: boolean`
- **AND** the `resolvePlan` method SHALL use this value

#### Scenario: preview passed from CLI

- **WHEN** a CLI command passes `preview: argv.preview` to workspace options
- **THEN** the value SHALL propagate to `resolvePlan` without the handler needing to pass it again
