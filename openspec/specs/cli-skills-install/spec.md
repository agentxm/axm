## MODIFIED Requirements

### Requirement: Workspace Pipeline Integration

The install handler SHALL use WorkspaceContext for initialization and workspace access.

#### Scenario: Resolve plan via workspace

- **WHEN** the plan is built
- **THEN** the handler SHALL call `ws.resolvePlan(plan, executors)` from `WorkspaceContextService`
- **AND** the `executors` argument SHALL be `{ "add-skill": (op) => executeAddSkill(op) }`
- **AND** the handler SHALL NOT contain inline plan display, confirm, or apply logic
- **AND** the handler SHALL NOT directly call `applyPlan` or `displayPlan`
