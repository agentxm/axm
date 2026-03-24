## MODIFIED Requirements

### Requirement: Enable handler orchestration

The enable handler SHALL validate skill state using taxonomy lifecycle views and build an `EnableSkillOperation` only for installed disabled skills.

#### Scenario: Enable a disabled installed skill

- **WHEN** the user runs `axm skills enable <name>` for a skill that is installed and currently disabled
- **THEN** the handler SHALL build an `EnableSkillOperation` with the skill name
- **AND** build a single-step plan
- **AND** resolve the plan via `ws.resolvePlan()`

#### Scenario: Skill is not installed

- **WHEN** the user runs `axm skills enable <name>` for a name outside installed lifecycle sets
- **THEN** the handler SHALL fail with a `AppError` indicating the skill is not installed
- **AND** the handler SHALL NOT use marker-based unmanaged validation paths

#### Scenario: Skill is ignored

- **WHEN** the skill name matches ignored patterns
- **THEN** the handler SHALL treat the skill as not installed for enable validation

### Requirement: Disable handler orchestration

The disable handler SHALL validate skill state using taxonomy lifecycle views and build a `DisableSkillOperation` for installed enabled skills.

#### Scenario: Disable an enabled installed skill

- **WHEN** the user runs `axm skills disable <name>` for a skill that is installed and currently enabled
- **THEN** the handler SHALL build a `DisableSkillOperation` with the skill name
- **AND** build a single-step plan
- **AND** resolve the plan via `ws.resolvePlan()`

#### Scenario: Disable implicit installed skill

- **WHEN** the user runs `axm skills disable <name>` for an implicit installed skill (not directly configured)
- **THEN** the disable flow SHALL promote it to a configured entry with `enabled: false`
- **AND** subsequent classification SHALL place it in configured lifecycle state

#### Scenario: Skill is not installed for disable

- **WHEN** the user runs `axm skills disable <name>` for a name outside installed lifecycle sets
- **THEN** the handler SHALL fail with a `AppError` indicating the skill is not installed
- **AND** the handler SHALL NOT use marker-based unmanaged validation paths
