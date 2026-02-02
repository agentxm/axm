## ADDED Requirements

### Requirement: Skill manifest schema validates axm-skill.json files

The schema SHALL validate skill manifest files with the following fields:

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

#### Scenario: Valid minimal skill manifest

- **WHEN** parsing `{ "name": "@wayne/grappling-hook", "version": "1.0.0" }`
- **THEN** validation succeeds and returns typed SkillManifest

#### Scenario: Valid full skill manifest

- **WHEN** parsing a manifest with all optional fields populated
- **THEN** validation succeeds and all fields are accessible with correct types

#### Scenario: Missing required name field

- **WHEN** parsing `{ "version": "1.0.0" }`
- **THEN** validation fails with error indicating missing `name` field

#### Scenario: Invalid name format

- **WHEN** parsing `{ "name": "grappling-hook", "version": "1.0.0" }`
- **THEN** validation fails with error indicating invalid name pattern

### Requirement: JSON schema generated for axm-skill.json

The system SHALL generate a JSON Schema file at `__generated__/axm-skill.schema.json` from the Effect schema.

#### Scenario: JSON schema matches Effect schema

- **WHEN** running schema generation
- **THEN** `axm-skill.schema.json` is created with matching structure and constraints
