## MODIFIED Requirements

### Requirement: Workspace Pipeline Integration

The install handler SHALL use WorkspaceContext for initialization and workspace access.

#### Scenario: Resolve plan via workspace

- **WHEN** the plan is built
- **THEN** the handler SHALL call `ws.resolvePlan(plan, handlers)` from `WorkspaceContextService`
- **AND** the `handlers` argument SHALL be `{ "install-skill": installSkill }`
- **AND** the handler SHALL NOT contain inline plan display, confirm, or apply logic
- **AND** the handler SHALL NOT directly call `applyPlan` or `displayPlan`

#### Scenario: Handler does not display results

- **WHEN** `resolvePlan` returns the applied plan
- **THEN** the handler SHALL NOT iterate over steps to display success or error messages
- **AND** result display SHALL be handled entirely by `resolvePlan` via `displayPlan`

#### Scenario: Skill filter applied before plan building

- **WHEN** `--skill` flags are provided (exact names or glob patterns)
- **THEN** the handler SHALL filter discovered skills using `expandGlob` before calling `determineSkillsToInstall`
- **AND** only matched skills SHALL be passed to the selection and plan building stages
