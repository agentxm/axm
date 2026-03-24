## MODIFIED Requirements

### Requirement: Ownership-aware skill removal

When uninstalling a skill, the handler SHALL resolve eligibility from taxonomy installed state (configured or implicit) and SHALL check pack ownership via `resolvedSkills` FQNs before removing lockfile and disk state.

#### Scenario: Installed skill removed when no pack references it

- **WHEN** user runs `axm skills uninstall review`
- **AND** `review` is installed
- **AND** its FQN is not referenced by any installed pack `resolvedSkills`
- **THEN** the skill SHALL be removed from settings, lockfile, and disk

#### Scenario: Installed skill kept on disk when pack still references it

- **WHEN** user runs `axm skills uninstall review`
- **AND** the skill's FQN is referenced by one or more installed packs in `resolvedSkills`
- **THEN** the skill SHALL be removed from settings when present
- **AND** the skill SHALL remain in lockfile and on disk

#### Scenario: Name resolves to unmanaged only

- **WHEN** user runs `axm skills uninstall <name>` and `<name>` is unmanaged-only (not installed)
- **THEN** uninstall SHALL fail with an `AppError` indicating the skill is not installed
- **AND** the flow SHALL NOT execute legacy unmanaged-marker removal shortcuts

#### Scenario: Ignored name is treated as not installed

- **WHEN** user runs `axm skills uninstall <name>` and `<name>` matches ignored patterns
- **THEN** uninstall SHALL treat the skill as not installed for lifecycle checks
