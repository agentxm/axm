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

### Requirement: Rename-aware update

When update re-resolves a configured skill source and the expected skill name is missing, the command SHALL detect straightforward renames and avoid guessing in ambiguous cases.

#### Scenario: Single-skill source rename detected

- **WHEN** update re-resolves a configured skill source
- **AND** the expected skill name is missing
- **AND** the source now exposes exactly one skill with a different name
- **THEN** the update plan SHALL install the new name and clean up the old name
- **AND** the plan display SHALL show the rename as `old-name -> new-name`

#### Scenario: Multi-skill source does not guess rename

- **WHEN** update re-resolves a configured skill source
- **AND** the expected skill name is missing
- **AND** the source exposes multiple skills
- **THEN** update SHALL warn and skip that skill instead of inferring a rename

#### Scenario: Source resolution failure does not stop other updates

- **WHEN** update cannot re-resolve one configured skill source
- **THEN** the command SHALL warn for that skill
- **AND** SHALL continue updating the remaining configured skills

### Requirement: Update respects version intent

Update SHALL preserve explicit user version intent, apply pack constraints to pack-provided dependencies, and warn when a pack keeps a user-installed skill behind the newest available version.

#### Scenario: Explicit user version constraint preserved

- **WHEN** a configured skill has an explicit version constraint
- **THEN** update SHALL keep resolving within that user-specified constraint

#### Scenario: Pack constraint holds back latest for user-installed skill

- **WHEN** a configured skill is intended to track the latest version
- **AND** an installed pack constrains that skill below the newest available version
- **THEN** update SHALL keep the constrained version
- **AND** SHALL warn that the installed pack is holding the skill below latest

#### Scenario: Pack-only skill does not warn about held-back latest

- **WHEN** a skill is present only as a pack dependency
- **AND** the pack constraint keeps it below latest
- **THEN** update SHALL NOT warn on behalf of a direct user install
