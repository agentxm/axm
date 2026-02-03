## MODIFIED Requirements

### Requirement: Lock entry schema

Each lock entry SHALL have the following fields:

| Field         | Type     | Required | Description                                             |
| ------------- | -------- | -------- | ------------------------------------------------------- |
| `source`      | object   | Yes      | SkillSource discriminated union (Registry/GitHub/Local) |
| `version`     | string   | No       | Semver version (registry sources only)                  |
| `gitTreeHash` | string   | No       | Git tree SHA of source folder (git sources)             |
| `agents`      | string[] | Yes      | Agent IDs this skill is installed for                   |
| `installedAt` | string   | Yes      | ISO 8601 timestamp of initial installation              |
| `updatedAt`   | string   | Yes      | ISO 8601 timestamp of last update                       |

#### Scenario: Valid skill lock entry with gitTreeHash

- **WHEN** parsing YAML content:
  ```yaml
  lockfileVersion: 1
  skills:
    my-skill:
      source:
        _tag: GitHub
        owner: wayne-industries
        repo: skills
        ref: main
        path: skills/my-skill
      gitTreeHash: abc123def456
      agents: [claude-code, cursor]
      installedAt: "2025-01-15T10:30:00Z"
      updatedAt: "2025-01-15T10:30:00Z"
  ```
- **THEN** validation succeeds and lock entry fields are accessible with correct types

#### Scenario: Valid registry skill lock entry with version

- **WHEN** parsing a lock entry with Registry source and version field
- **THEN** validation succeeds and version is typed as string

#### Scenario: Missing agents field

- **WHEN** parsing a lock entry without `agents` array
- **THEN** validation fails with error indicating missing required field

### Requirement: Skills at root level

The lockfile SHALL have skills directly at root level (not nested under extensions).

#### Scenario: Skills at root

- **WHEN** parsing YAML content:
  ```yaml
  lockfileVersion: 1
  skills:
    my-skill:
      source: { _tag: Local, path: ./my-skills }
      agents: [claude-code]
      installedAt: "2025-01-15T10:30:00Z"
      updatedAt: "2025-01-15T10:30:00Z"
  ```
- **THEN** validation succeeds and skills map is at root level

## REMOVED Requirements

### Requirement: Lock entry origin field

**Reason**: Redundant with structured source object; origin was denormalized URL.

**Migration**: Use source object fields to construct origin if needed.

### Requirement: Lock entry folderHash field

**Reason**: Renamed to gitTreeHash for clarity; only applies to git sources.

**Migration**: Field renamed; content hash for local sources computed on demand.

### Requirement: Extensions grouped by type

**Reason**: Simplified to skills-only for now; future extension types will be added as needed.

**Migration**: Use root-level `skills` map instead of `extensions.skills`.
