## MODIFIED Requirements

### Requirement: State-Based Uninstall

The CLI SHALL use the workspace reconciliation pattern for uninstallation.

#### Scenario: Load current state

- **WHEN** starting uninstallation
- **THEN** the CLI calls `loadSkillsState()` to get merged actual and locked state

#### Scenario: Build ideal state

- **WHEN** processing uninstall request
- **THEN** the CLI calls `buildIdealForUninstall()` with target skill removed (from specified agents or all)

#### Scenario: Compute plan

- **WHEN** current and ideal states are ready
- **THEN** the CLI calls `computeDiff()` to compute the plan

#### Scenario: Apply plan via applyDiff

- **WHEN** changes are confirmed
- **THEN** the CLI calls `applyDiff()` to remove skill files, update lockfile, and update settings
- **AND** the handler does NOT directly call `removeSkillFromAgents`, `updateSettings`, `removeLockEntry`, or `updateLockEntry`
