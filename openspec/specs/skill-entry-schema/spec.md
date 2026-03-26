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

### Requirement: Collapse on write

The collapse/write path for skill entries SHALL emit only configured-entry forms: plain source string for enabled defaults, or object form when non-default fields are needed.

#### Scenario: Enabled configured entry collapses to string

- **WHEN** a configured skill has `source: "github:owner/repo"` and `enabled: true`
- **THEN** it SHALL collapse to the plain string `"github:owner/repo"`

#### Scenario: Disabled configured entry collapses to object

- **WHEN** a configured skill has `source: "github:owner/repo"` and `enabled: false`
- **THEN** it SHALL collapse to `{ source: "github:owner/repo", enabled: false }`
