## ADDED Requirements

### Requirement: Pack manifest schema validates axm-pack.json files

The schema SHALL validate pack manifest files with the following fields:

| Field         | Type     | Required | Description                              |
| ------------- | -------- | -------- | ---------------------------------------- |
| `name`        | string   | Yes      | Fully qualified name (`@<scope>/<name>`) |
| `version`     | string   | Yes      | Semver version                           |
| `description` | string   | No       | Short description                        |
| `keywords`    | string[] | No       | Tags for discovery                       |
| `repository`  | string   | No       | Source repository URL                    |
| `homepage`    | string   | No       | Project homepage URL                     |
| `license`     | string   | No       | SPDX license identifier                  |
| `bugs`        | string   | No       | Issue tracker URL                        |
| `author`      | object   | No       | `{ name, email?, url? }`                 |
| `skills`      | string[] | No       | Fully qualified skill names              |
| `commands`    | string[] | No       | Fully qualified command names            |
| `mcp-servers` | string[] | No       | Fully qualified MCP server names         |
| `packs`       | string[] | No       | Fully qualified pack names (nested)      |

The `name` field SHALL match the pattern `@<scope>/<name>` where scope and name contain only alphanumeric characters, hyphens, and underscores.

All extension reference arrays (`skills`, `commands`, `mcp-servers`, `packs`) SHALL contain fully qualified names matching the `@<scope>/<name>` pattern.

#### Scenario: Valid minimal pack manifest

- **WHEN** parsing `{ "name": "@wayne/utility-belt", "version": "1.0.0" }`
- **THEN** validation succeeds and returns typed PackManifest

#### Scenario: Valid pack with extensions

- **WHEN** parsing:
  ```json
  {
    "name": "@wayne/utility-belt",
    "version": "1.0.0",
    "skills": ["@wayne/grappling-hook"],
    "mcp-servers": ["@wayne/batcomputer"],
    "packs": ["@wayne/base-toolkit"]
  }
  ```
- **THEN** validation succeeds and extension arrays are typed correctly

#### Scenario: Invalid extension reference format

- **WHEN** parsing `{ "name": "@wayne/utility-belt", "version": "1.0.0", "skills": ["grappling-hook"] }`
- **THEN** validation fails with error indicating invalid skill name pattern

### Requirement: JSON schema generated for axm-pack.json

The system SHALL generate a JSON Schema file at `__generated__/axm-pack.schema.json` from the Effect schema.

#### Scenario: JSON schema matches Effect schema

- **WHEN** running schema generation
- **THEN** `axm-pack.schema.json` is created with matching structure and constraints
