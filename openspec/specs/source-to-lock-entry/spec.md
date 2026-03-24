## ADDED Requirements

### Requirement: Map Source to SkillLockEntry

The `sourceToLockEntry` function SHALL be a pure function that maps a `Source` discriminated union and operation metadata to the corresponding `SkillLockEntry` variant for lockfile persistence.

#### Scenario: GitHub source mapping

- **WHEN** mapping a source with `source: "github"`
- **THEN** the lock entry SHALL have `source: "github"` with `owner`, `repo`, and optional `ref` and `path` fields
- **AND** `source.subPath` SHALL map to lock entry `path`

#### Scenario: GitLab source mapping

- **WHEN** mapping a source with `source: "gitlab"`
- **THEN** the lock entry SHALL have `source: "gitlab"` with `owner`, `repo`, and optional `ref` and `path` fields

#### Scenario: Bitbucket source mapping

- **WHEN** mapping a source with `source: "bitbucket"`
- **THEN** the lock entry SHALL have `source: "bitbucket"` with `owner`, `repo`, and optional `ref` and `path` fields

#### Scenario: Azure Repos source mapping

- **WHEN** mapping a source with `source: "azurerepos"`
- **THEN** the lock entry SHALL have `source: "azurerepos"` with `organization`, `project`, `repo`, and optional `ref` and `path` fields

#### Scenario: Git URL source mapping

- **WHEN** mapping a source with `source: "git"` using a URL variant
- **THEN** the lock entry SHALL have `source: "git"` with `url` field
- **AND** optional `ref` and `path` fields

#### Scenario: Git path source mapping

- **WHEN** mapping a source with `source: "git"` using a path variant
- **THEN** the lock entry SHALL have `source: "git"` with `path` field (from `source.path`)

#### Scenario: Local source mapping

- **WHEN** mapping a source with `source: "local"`
- **THEN** the lock entry SHALL have `source: "local"` with `path` field

#### Scenario: Registry source mapping

- **WHEN** mapping a source with `source: "registry"`
- **THEN** the lock entry SHALL have `source: "registry"` with `profile` and `name` fields

#### Scenario: Option fields converted to plain values

- **WHEN** the source contains `Option<T>` fields (e.g., `ref`, `subPath`)
- **THEN** `Option.some(value)` SHALL map to `value`
- **AND** `Option.none()` SHALL map to `undefined`

#### Scenario: Common metadata fields populated

- **WHEN** creating any lock entry
- **THEN** the entry SHALL include `agents` (from operation), `installedAt`, `updatedAt` (current timestamps), and `gitTreeHash` (from operation, when present)
