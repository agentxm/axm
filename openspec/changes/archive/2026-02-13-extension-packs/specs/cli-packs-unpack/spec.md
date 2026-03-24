## ADDED Requirements

### Requirement: Unpack flattens pack into settings

`axm packs unpack <name>` SHALL add all of a pack's referenced extensions as direct entries in the appropriate settings.json sections, then remove the pack entry from settings.

This is a settings-level operation — it SHALL NOT re-download or re-install any extensions.

#### Scenario: Unpack pack with skills and commands

- **WHEN** user runs `axm packs unpack @acme/frontend-pack`
- **AND** the pack's `resolvedSkills` contains `@acme/code-review` and `@acme/linting`
- **AND** the pack's `resolvedCommands` contains `@acme/formatter`
- **THEN** settings.json `skills` section gains entries for `code-review` and `linting`
- **AND** settings.json `commands` section gains entry for `formatter`
- **AND** settings.json `packs` section no longer contains `frontend-pack`

#### Scenario: Existing direct entries preserved

- **WHEN** user runs `axm packs unpack @acme/frontend-pack`
- **AND** `@acme/code-review` already has a direct settings entry with `enabled: false`
- **THEN** the existing entry is NOT overwritten
- **AND** the skill remains `enabled: false`

#### Scenario: Extensions remain installed on disk

- **WHEN** a pack is unpacked
- **THEN** all referenced extensions remain on disk in their managed locations
- **AND** agent symlinks remain intact

### Requirement: Unpack removes pack lockfile entry

After unpacking, the pack lock entry SHALL be removed from the lockfile `packs` section. The individual extension lock entries SHALL remain.

#### Scenario: Lockfile updated after unpack

- **WHEN** pack `@acme/frontend-pack` is successfully unpacked
- **THEN** the `packs` section in the lockfile no longer contains `@acme/frontend-pack`
- **AND** individual skill/command/mcp-server lock entries remain unchanged

### Requirement: Unpack plan display and confirmation

#### Scenario: Preview mode

- **WHEN** user runs `axm packs unpack @acme/frontend-pack --preview`
- **THEN** the plan shows what settings entries would be added and the pack entry that would be removed
- **AND** the plan is NOT applied

#### Scenario: Auto-accept

- **WHEN** user runs `axm packs unpack @acme/frontend-pack --yes`
- **THEN** the plan is applied without prompting

### Requirement: Pack must be installed

`axm packs unpack` SHALL fail if the specified pack is not installed.

#### Scenario: Pack not installed

- **WHEN** user runs `axm packs unpack @acme/nonexistent`
- **AND** no pack named `@acme/nonexistent` is installed
- **THEN** the command fails with an `AppError` indicating the pack is not installed
