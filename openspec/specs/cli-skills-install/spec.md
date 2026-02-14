## Requirements

### Requirement: Workspace Pipeline Integration

The install handler SHALL use WorkspaceContext for initialization and workspace access. The handler works with the enriched skill entry model transparently — `ws.setSkill()` handles normalization and collapse.

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

### Requirement: Install writes default entry form

The install handler SHALL write the settings entry as a plain string (collapsed form) via `ws.setSkill()`. If the source string includes a version constraint, the full source string including the version SHALL be persisted. Install always implies `enabled: true` and `managed: true`.

#### Scenario: Install writes default entry form

- **WHEN** a skill is installed via `axm install @acme/tool`
- **THEN** `ws.setSkill()` SHALL write the entry as `"@acme/tool"` (plain string, no version)

#### Scenario: Install preserves version constraint

- **WHEN** a skill is installed via `axm install @acme/tool@^1.0.0`
- **THEN** `ws.setSkill()` SHALL write the entry as `"@acme/tool@^1.0.0"` (version constraint preserved in source string)

#### Scenario: Install preserves exact pin

- **WHEN** a skill is installed via `axm install @acme/tool@1.2.3`
- **THEN** `ws.setSkill()` SHALL write the entry as `"@acme/tool@1.2.3"`
