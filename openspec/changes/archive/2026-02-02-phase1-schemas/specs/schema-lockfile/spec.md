## ADDED Requirements

### Requirement: Lockfile schema validates axm.lock files

The schema SHALL validate lockfiles with the following structure:

| Field             | Type   | Required | Description                               |
| ----------------- | ------ | -------- | ----------------------------------------- |
| `lockfileVersion` | number | Yes      | Schema version (currently `1`)            |
| `extensions`      | object | Yes      | Map of extension type → name → lock entry |

#### Scenario: Valid minimal lockfile

- **WHEN** parsing `{ "lockfileVersion": 1, "extensions": {} }`
- **THEN** validation succeeds and returns typed Lockfile

#### Scenario: Missing lockfileVersion

- **WHEN** parsing `{ "extensions": {} }`
- **THEN** validation fails with error indicating missing `lockfileVersion` field

### Requirement: Lock entry schema

Each lock entry SHALL have the following fields:

| Field          | Type     | Required | Description                                              |
| -------------- | -------- | -------- | -------------------------------------------------------- |
| `source`       | string   | Yes      | Normalized source identifier (e.g., `github:owner/repo`) |
| `origin`       | string   | Yes      | Fully resolved source URL or path                        |
| `path`         | string   | No       | Subpath within source repository                         |
| `ref`          | string   | No       | Git ref (branch, tag, commit) for git sources            |
| `version`      | string   | No       | Semver version (registry sources only)                   |
| `folderHash`   | string   | Yes      | Git tree SHA or content hash                             |
| `dependencies` | string[] | No       | Fully qualified names of required extensions             |
| `installedAt`  | string   | Yes      | ISO 8601 timestamp of initial installation               |
| `updatedAt`    | string   | Yes      | ISO 8601 timestamp of last update                        |

#### Scenario: Valid skill lock entry

- **WHEN** parsing:
  ```json
  {
    "lockfileVersion": 1,
    "extensions": {
      "skills": {
        "@wayne/grappling-hook": {
          "source": "github:wayne-industries/skills",
          "origin": "https://github.com/wayne-industries/skills",
          "path": "skills/grappling-hook",
          "ref": "main",
          "folderHash": "abc123def456",
          "installedAt": "2025-01-15T10:30:00Z",
          "updatedAt": "2025-01-15T10:30:00Z"
        }
      }
    }
  }
  ```
- **THEN** validation succeeds and lock entry fields are accessible with correct types

#### Scenario: Valid pack lock entry with dependencies

- **WHEN** parsing a pack lock entry with `dependencies` array
- **THEN** validation succeeds and dependencies are typed as string array

#### Scenario: Missing required lock entry fields

- **WHEN** parsing a lock entry without `source`, `origin`, `folderHash`, `installedAt`, or `updatedAt`
- **THEN** validation fails with errors indicating missing required fields

### Requirement: Extensions grouped by type

The `extensions` field SHALL organize entries by extension type:

- `skills`: Map of skill name → lock entry
- `commands`: Map of command name → lock entry
- `packs`: Map of pack name → lock entry
- `mcp-servers`: Map of MCP server name → lock entry

Each extension name SHALL match the `@<scope>/<name>` pattern.

#### Scenario: Valid lockfile with multiple types

- **WHEN** parsing a lockfile with skills, commands, and mcp-servers entries
- **THEN** validation succeeds and each type section is accessible

#### Scenario: Invalid extension name in lockfile

- **WHEN** parsing `{ "lockfileVersion": 1, "extensions": { "skills": { "grappling-hook": { ... } } } }`
- **THEN** validation fails with error indicating invalid extension name pattern

### Requirement: JSON schema generated for axm.lock

The system SHALL generate a JSON Schema file at `__generated__/axm-lock.schema.json` from the Effect schema.

#### Scenario: JSON schema matches Effect schema

- **WHEN** running schema generation
- **THEN** `axm-lock.schema.json` is created with matching structure and constraints
