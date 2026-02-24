## MODIFIED Requirements

### Requirement: Rename handler orchestration

The rename handler SHALL validate rename eligibility using taxonomy lifecycle state and resolve a `RenameSkillOperation` only for configured installed skills.

#### Scenario: Rename a configured installed skill

- **WHEN** the user runs `axm skills rename <old-name> <new-name>` and `<old-name>` is configured
- **THEN** the handler SHALL build a `RenameSkillOperation` with old and new names
- **AND** build a single-step plan
- **AND** resolve the plan via `ws.resolvePlan()`

#### Scenario: Old name is not configured

- **WHEN** `<old-name>` is implicit-only, unmanaged, ignored, or absent from configured settings entries
- **THEN** the handler SHALL fail with a `CliError` indicating the skill was not found in configured entries
- **AND** the handler SHALL NOT rely on unmanaged marker checks

#### Scenario: New name conflicts with existing configured skill

- **WHEN** `<new-name>` already exists in configured settings entries
- **THEN** the handler SHALL fail with a `CliError` indicating name conflict
