## MODIFIED Requirements

### Requirement: SkillEntry schema union type

The `SkillEntrySchema` SHALL be a union of two forms only: a plain string and a `SkillEntryObjectSchema`. The unmanaged marker object (`{ managed: false }`) SHALL NOT be part of valid schema input.

#### Scenario: Plain string entry remains valid

- **WHEN** a skill entry in settings is a plain string (e.g., `"github:owner/repo"`)
- **THEN** it SHALL be parsed as a configured entry with `source` set to that string and `enabled` defaulting to `true`

#### Scenario: Object entry with source remains valid

- **WHEN** a skill entry is an object with `source`
- **THEN** it SHALL be parsed as a configured entry with `source: string` and optional `enabled`

#### Scenario: Legacy unmanaged marker is rejected

- **WHEN** a skill entry is `{ managed: false }`
- **THEN** settings validation SHALL fail
- **AND** the failure SHALL indicate the marker-based unmanaged form is unsupported in this model

### Requirement: NormalizedSkillEntry internal representation

Internal workspace and handler logic SHALL treat configured skill settings entries as configured lifecycle inputs (`source: string`, `enabled: boolean`) and SHALL derive unmanaged status from classifier inputs instead of entry markers.

#### Scenario: Configured entry keeps concrete source string

- **WHEN** a configured skill entry is read from settings
- **THEN** the configured representation SHALL expose `source` as `string`
- **AND** the representation SHALL NOT include a `managed` boolean

#### Scenario: Unmanaged status is classifier-derived

- **WHEN** a skill appears on disk but has no configured settings entry
- **THEN** unmanaged status SHALL be derived by classification
- **AND** settings entry shape SHALL remain unchanged

### Requirement: Collapse on write

The collapse/write path for skill entries SHALL emit only configured-entry forms: plain source string for enabled defaults, or object form when non-default fields are needed.

#### Scenario: Enabled configured entry collapses to string

- **WHEN** a configured skill has `source: "github:owner/repo"` and `enabled: true`
- **THEN** it SHALL collapse to the plain string `"github:owner/repo"`

#### Scenario: Disabled configured entry collapses to object

- **WHEN** a configured skill has `source: "github:owner/repo"` and `enabled: false`
- **THEN** it SHALL collapse to `{ source: "github:owner/repo", enabled: false }`

### Requirement: Workspace service entry access

Workspace service skill getters SHALL expose classifier-consistent lifecycle views, with configured entries from settings and installed entries from configured-plus-implicit classification.

#### Scenario: getConfiguredSkills returns configured entries only

- **WHEN** `getConfiguredSkills()` is called
- **THEN** it SHALL return only configured settings entries
- **AND** each returned value SHALL include configured source and enabled state

#### Scenario: getInstalledSkills returns configured plus implicit

- **WHEN** `getInstalledSkills()` is called
- **THEN** it SHALL return configured and implicit installed entries
- **AND** it SHALL exclude unmanaged and ignored names

#### Scenario: updateSkillEntry fails for missing configured skill

- **WHEN** `updateSkillEntry(name, updater)` is called with a name not present in configured settings entries
- **THEN** it SHALL fail with `SKILL_NOT_FOUND`
