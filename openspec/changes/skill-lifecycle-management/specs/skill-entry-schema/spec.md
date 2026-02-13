## ADDED Requirements

### Requirement: SkillEntry schema union type

The `SkillEntrySchema` SHALL be a union of three forms: a plain string, a `SkillEntryObjectSchema`, and an `UnmanagedSkillEntrySchema`. The `SkillsMapSchema` value type SHALL use `SkillEntrySchema` instead of `Schema.String`.

#### Scenario: Plain string entry

- **WHEN** a skill entry in settings is a plain string (e.g., `"github:owner/repo"`)
- **THEN** it SHALL be valid and equivalent to `{ source: "<value>", enabled: true, managed: true }`

#### Scenario: Managed object entry with source

- **WHEN** a skill entry is an object with a `source` field
- **THEN** it SHALL be parsed as `SkillEntryObjectSchema` with `source: string` (required) and `enabled: boolean` (optional, default `true`)

#### Scenario: Unmanaged entry

- **WHEN** a skill entry is an object with `managed: false`
- **THEN** it SHALL be parsed as `UnmanagedSkillEntrySchema`
- **AND** no `source` or `enabled` fields SHALL be present

#### Scenario: Invalid entry rejected

- **WHEN** a skill entry is an object that matches neither `SkillEntryObjectSchema` nor `UnmanagedSkillEntrySchema`
- **THEN** the schema SHALL reject it with a parse error

### Requirement: NormalizedSkillEntry internal representation

All handler and service code SHALL work with `NormalizedSkillEntry` — the canonical internal form with `source: Option<string>`, `enabled: boolean`, and `managed: boolean`.

#### Scenario: String entry normalization

- **WHEN** a plain string entry `"github:owner/repo"` is normalized
- **THEN** it SHALL produce `{ source: Some("github:owner/repo"), enabled: true, managed: true }`

#### Scenario: SkillEntryObject normalization

- **WHEN** a `SkillEntryObjectSchema` entry `{ source: "github:owner/repo", enabled: false }` is normalized
- **THEN** it SHALL produce `{ source: Some("github:owner/repo"), enabled: false, managed: true }`

#### Scenario: SkillEntryObject with defaults normalization

- **WHEN** a `SkillEntryObjectSchema` entry `{ source: "github:owner/repo" }` is normalized (no `enabled` field)
- **THEN** it SHALL produce `{ source: Some("github:owner/repo"), enabled: true, managed: true }`

#### Scenario: UnmanagedSkillEntry normalization

- **WHEN** an `UnmanagedSkillEntrySchema` entry `{ managed: false }` is normalized
- **THEN** it SHALL produce `{ source: None, enabled: true, managed: false }`

### Requirement: Collapse on write

The `collapseSkillEntry` function SHALL convert a `NormalizedSkillEntry` back to the most compact settings representation.

#### Scenario: Collapse to string when all defaults

- **WHEN** a `NormalizedSkillEntry` has `source: Some("<value>")`, `enabled: true`, and `managed: true`
- **THEN** it SHALL collapse to the plain string `"<value>"`

#### Scenario: Preserve object form when enabled is false

- **WHEN** a `NormalizedSkillEntry` has `source: Some("<value>")`, `enabled: false`, and `managed: true`
- **THEN** it SHALL collapse to `{ source: "<value>", enabled: false }`

#### Scenario: Unmanaged collapses to managed-false marker

- **WHEN** a `NormalizedSkillEntry` has `managed: false`
- **THEN** it SHALL collapse to `{ managed: false }` regardless of `enabled` or `source` values

### Requirement: Workspace service entry access

The workspace service SHALL provide methods for reading and updating skill entries using the normalized form.

#### Scenario: getConfiguredSkills returns all entries normalized

- **WHEN** `getConfiguredSkills()` is called
- **THEN** it SHALL return all skill entries from settings (managed and unmanaged), normalized to `NormalizedSkillEntry`

#### Scenario: getInstalledSkills returns managed entries only

- **WHEN** `getInstalledSkills()` is called
- **THEN** it SHALL return only entries where `managed` is `true`, normalized to `NormalizedSkillEntry`
- **AND** all returned entries SHALL have `source` as `Some`

#### Scenario: updateSkillEntry applies updater function

- **WHEN** `updateSkillEntry(name, updater)` is called with a name that exists in settings
- **THEN** it SHALL read the current entry, normalize it, apply the updater function, collapse the result, and write back to settings

#### Scenario: updateSkillEntry fails for missing skill

- **WHEN** `updateSkillEntry(name, updater)` is called with a name not in settings
- **THEN** it SHALL fail with a `CliError`

#### Scenario: renameSkill atomically renames keys

- **WHEN** `renameSkill(oldName, newName)` is called
- **THEN** it SHALL read the old entry and lock entry, write both under the new key, and remove the old keys
- **AND** the operation SHALL be mutex-protected

#### Scenario: renameSkill fails for missing skill

- **WHEN** `renameSkill(oldName, newName)` is called with an old name not in settings
- **THEN** it SHALL fail with a `CliError`

#### Scenario: updateLockEntryAgents updates lock agents

- **WHEN** `updateLockEntryAgents(name, agents)` is called
- **THEN** it SHALL update the `agents` field on the lock entry for the given skill

#### Scenario: updateLockEntryAgents fails for missing lock entry

- **WHEN** `updateLockEntryAgents(name, agents)` is called with a name not in the lockfile
- **THEN** it SHALL fail with a `CliError`
