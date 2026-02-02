## ADDED Requirements

### Requirement: MCP server manifest schema validates axm-mcp-server.json files

The schema SHALL validate MCP server manifest files with the following fields:

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

The `name` field SHALL match the pattern `@<scope>/<name>` where scope and name contain only alphanumeric characters, hyphens, and underscores.

Note: Additional MCP-specific fields are TBD per proposal.md and will be added in future iterations.

#### Scenario: Valid minimal MCP server manifest

- **WHEN** parsing `{ "name": "@wayne/batcave-mcp", "version": "1.0.0" }`
- **THEN** validation succeeds and returns typed McpServerManifest

#### Scenario: Valid full MCP server manifest

- **WHEN** parsing a manifest with all optional fields populated
- **THEN** validation succeeds and all fields are accessible with correct types

#### Scenario: Missing required fields

- **WHEN** parsing `{ "description": "MCP server" }`
- **THEN** validation fails with errors indicating missing `name` and `version` fields

### Requirement: JSON schema generated for axm-mcp-server.json

The system SHALL generate a JSON Schema file at `__generated__/axm-mcp-server.schema.json` from the Effect schema.

#### Scenario: JSON schema matches Effect schema

- **WHEN** running schema generation
- **THEN** `axm-mcp-server.schema.json` is created with matching structure and constraints
