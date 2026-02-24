## ADDED Requirements

### Requirement: Update iterates configured skill entries only

The update handler SHALL use configured skill entries from settings as the update candidate set. It SHALL NOT iterate unmanaged discovered skills or implicit lockfile-only skills as direct update targets.

#### Scenario: Configured enabled skill is considered for update

- **WHEN** a skill exists as a configured entry with `enabled: true`
- **THEN** update candidate selection SHALL include that skill

#### Scenario: Configured disabled skill is skipped

- **WHEN** a skill exists as a configured entry with `enabled: false`
- **THEN** the update handler SHALL skip update execution for that skill

#### Scenario: Implicit lockfile-only skill is not a direct candidate

- **WHEN** a skill exists only as an implicit installed lockfile entry
- **THEN** the update handler SHALL NOT include it in configured update iteration

### Requirement: Update logging excludes legacy unmanaged-marker paths

Update logging SHALL not emit legacy marker-based unmanaged skip messages.

#### Scenario: No unmanaged-marker skip log

- **WHEN** `axm skills update` runs
- **THEN** output SHALL NOT include legacy unmanaged marker skip language
- **AND** reporting SHALL reflect configured-entry iteration behavior
