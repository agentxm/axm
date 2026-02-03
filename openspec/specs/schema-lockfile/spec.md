### Requirement: Lock entry schema

Each lock entry SHALL have the following fields:

| Field         | Type     | Required | Description                                       |
| ------------- | -------- | -------- | ------------------------------------------------- |
| `source`      | string   | Yes      | Source type from `extension-sources` SourceSchema |
| `owner`       | string   | No       | GitHub owner (github source only)                 |
| `repo`        | string   | No       | GitHub repo name (github source only)             |
| `url`         | string   | No       | Git URL (git source only)                         |
| `path`        | string   | No       | Subpath within repo (github/git) or local path    |
| `ref`         | string   | No       | Git ref (github/git sources)                      |
| `scope`       | string   | No       | Registry scope (registry source only)             |
| `name`        | string   | No       | Registry package name (registry source only)      |
| `version`     | string   | No       | Semver version (registry source only)             |
| `gitTreeHash` | string   | No       | Git tree SHA of source folder (git sources)       |
| `agents`      | string[] | Yes      | Agent IDs this skill is installed for             |
| `installedAt` | string   | Yes      | ISO 8601 timestamp of initial installation        |
| `updatedAt`   | string   | Yes      | ISO 8601 timestamp of last update                 |

The `source` field SHALL use `SourceSchema` imported from `extension-sources`.

#### Scenario: Valid GitHub skill lock entry

- **WHEN** parsing YAML content:
  ```yaml
  lockfileVersion: 1
  skills:
    my-skill:
      source: github
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

#### Scenario: Valid local skill lock entry

- **WHEN** parsing YAML content:
  ```yaml
  lockfileVersion: 1
  skills:
    my-skill:
      source: local
      path: ./my-skills
      agents: [claude-code]
      installedAt: "2025-01-15T10:30:00Z"
      updatedAt: "2025-01-15T10:30:00Z"
  ```
- **THEN** validation succeeds and path field is accessible

#### Scenario: Valid registry skill lock entry

- **WHEN** parsing YAML content:
  ```yaml
  lockfileVersion: 1
  skills:
    my-skill:
      source: registry
      scope: "@acme"
      name: my-skill
      version: "1.2.3"
      agents: [claude-code]
      installedAt: "2025-01-15T10:30:00Z"
      updatedAt: "2025-01-15T10:30:00Z"
  ```
- **THEN** validation succeeds and version is typed as string

#### Scenario: Invalid source type

- **WHEN** parsing a lock entry with `source: "invalid"`
- **THEN** validation fails with error indicating invalid source type

#### Scenario: Missing required field for source type

- **WHEN** parsing a GitHub lock entry without `owner` field
- **THEN** validation fails with error indicating missing required field

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
      source: local
      path: ./my-skills
      agents: [claude-code]
      installedAt: "2025-01-15T10:30:00Z"
      updatedAt: "2025-01-15T10:30:00Z"
  ```
- **THEN** validation succeeds and skills map is at root level
