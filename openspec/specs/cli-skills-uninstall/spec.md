## MODIFIED Requirements

### Requirement: Ownership-aware skill removal

When uninstalling a skill, the system SHALL resolve the uninstall target from the lockfile and SHALL check pack ownership via the uninstall retention policy before removing lockfile and disk state.

#### Scenario: Installed skill removed when no pack references it

- **WHEN** user runs `axm skills uninstall review`
- **AND** `review` is installed (present in lockfile)
- **AND** `review` is not referenced by any installed pack's resolved dependencies
- **THEN** the skill SHALL be removed from settings, lockfile, and disk

#### Scenario: Installed skill kept on disk when pack still references it

- **WHEN** user runs `axm skills uninstall review`
- **AND** the skill is referenced by one or more installed packs in their resolved dependencies
- **THEN** the skill SHALL be removed from settings when present
- **AND** the skill SHALL be marked as retained in the lockfile
- **AND** the skill SHALL remain on disk

#### Scenario: Name resolves to unmanaged only

- **WHEN** user runs `axm skills uninstall <name>` and `<name>` is not found in the lockfile
- **THEN** uninstall SHALL fail with a `AppError` indicating the skill is not installed

#### Scenario: Ignored name is treated as not installed

- **WHEN** user runs `axm skills uninstall <name>` and `<name>` matches ignored patterns
- **THEN** uninstall SHALL treat the skill as not installed for lifecycle checks

## ADDED Requirements

### Requirement: Workspace-scoped skill uninstall

`axm skills uninstall` SHALL uninstall skills from the entire workspace. There SHALL be no `--agent` flag for per-agent targeting. Uninstall removes the skill from all agents.

#### Scenario: Skill uninstalled from all agents without flag

- **WHEN** user runs `axm skills uninstall code-review`
- **THEN** the skill SHALL be removed from all agents in the workspace
- **AND** no `--agent` flag SHALL be accepted

#### Scenario: Agent flag is rejected on uninstall

- **WHEN** user runs `axm skills uninstall code-review --agent claude`
- **THEN** the command SHALL reject the `--agent` flag as unrecognized

### Requirement: Uninstall target resolution from lockfile

Skill uninstall targets SHALL be resolved from the lockfile. If a skill name is not found in the lockfile, the uninstall SHALL fail with a `AppError`.

#### Scenario: Skill name resolved from lockfile

- **WHEN** user runs `axm skills uninstall code-review`
- **AND** `code-review` exists in the lockfile
- **THEN** the uninstall target SHALL be resolved from the lockfile entry

#### Scenario: Skill name not in lockfile fails

- **WHEN** user runs `axm skills uninstall unknown-skill`
- **AND** `unknown-skill` is not in the lockfile
- **THEN** uninstall SHALL fail with a `AppError` indicating the skill is not installed
