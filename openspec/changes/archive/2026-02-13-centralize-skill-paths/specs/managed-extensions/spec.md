## MODIFIED Requirements

### Requirement: Install pipeline conditional path

Skill operation handlers SHALL delegate canonical path computation to `Workspace.getSkillDir` instead of independently branching on source type. For registry sources, `skillSrcPath` (`<canonical>/src/`) SHALL be used for agent symlinks and file copies.

#### Scenario: Registry source uses managed location

- **WHEN** installing a skill with `source: "registry"`
- **THEN** skill content files are written to the `skillSrcPath` returned by `getSkillDir`
- **AND** `skillSrcPath` resolves to `.axm/extensions/@<namespace>/skills/<name>/src/`

#### Scenario: Other sources use existing location

- **WHEN** installing a skill with `source: "github"` or `source: "local"`
- **THEN** files are written to the `skillSrcPath` returned by `getSkillDir`
- **AND** `skillSrcPath` resolves to `.agents/skills/<sanitized-name>/`

#### Scenario: Pre-clean removes from all known locations

- **WHEN** a skill is being installed (regardless of source type)
- **THEN** existing files are removed from both `.axm/extensions/` and `.agents/skills/` and agent symlinks are cleaned up (ensures clean transitions when source type changes)

### Requirement: Uninstall reads lockfile for cleanup location

The `skills uninstall` handler SHALL determine the canonical location from the lockfile entry's source field.

#### Scenario: Uninstall registry-sourced skill

- **WHEN** uninstalling a skill whose lockfile entry has `source: "registry"`
- **THEN** files are removed from `.axm/extensions/@<namespace>/skills/<name>/`

#### Scenario: Uninstall git-sourced skill

- **WHEN** uninstalling a skill whose lockfile entry has `source: "github"`
- **THEN** files are removed from `.agents/skills/<name>/`
