## MODIFIED Requirements

### Requirement: Diff Computation

The system SHALL compute diff between current and ideal state as a Plan with PlanStep entries.

#### Scenario: New skill (InstallSkill)

- **WHEN** ideal contains a skill not in current
- **THEN** plan contains an InstallSkill step for that skill

#### Scenario: Removed skill (UninstallSkill)

- **WHEN** current contains a skill not in ideal (and skill has both actual and locked)
- **THEN** plan contains an UninstallSkill step for that skill

#### Scenario: Updated GitHub skill (UpdateSkill)

- **WHEN** ideal skill source is GitHub and gitTreeHash differs from current
- **THEN** plan contains an UpdateSkill step with from/to hash values

#### Scenario: GitHub skill without hash always updates

- **WHEN** ideal skill source is GitHub and gitTreeHash is undefined (API unavailable)
- **THEN** plan contains an UpdateSkill step (no stable identifier for comparison)

#### Scenario: Updated registry skill (UpdateSkill)

- **WHEN** ideal skill source is registry and version differs from current
- **THEN** plan contains an UpdateSkill step with from/to version values

#### Scenario: Local skill always updates

- **WHEN** ideal skill source is Local
- **THEN** plan contains an UpdateSkill step (no stable identifier)

#### Scenario: Generic git skill always updates

- **WHEN** ideal skill source is git (non-GitHub)
- **THEN** plan contains an UpdateSkill step (no stable identifier, gitTreeHash not supported)

#### Scenario: Unchanged GitHub skill

- **WHEN** ideal GitHub skill has same gitTreeHash as current
- **THEN** no step is included in the plan

#### Scenario: Unchanged registry skill

- **WHEN** ideal registry skill has same version as current
- **THEN** no step is included in the plan
