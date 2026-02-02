## MODIFIED Requirements

### Requirement: Lockfile schema validates axm-lock.yaml files

The schema SHALL validate lockfiles with the following structure:

| Field             | Type   | Required | Description                               |
| ----------------- | ------ | -------- | ----------------------------------------- |
| `lockfileVersion` | number | Yes      | Schema version (currently `1`)            |
| `extensions`      | object | Yes      | Map of extension type → name → lock entry |

The lockfile SHALL be stored in YAML format at `axm-lock.yaml`.

#### Scenario: Valid minimal lockfile

- **WHEN** parsing YAML content `lockfileVersion: 1\nextensions: {}`
- **THEN** validation succeeds and returns typed Lockfile

#### Scenario: Missing lockfileVersion

- **WHEN** parsing YAML content `extensions: {}`
- **THEN** validation fails with error indicating missing `lockfileVersion` field

### Requirement: JSON schema generated for axm-lock.yaml

The system SHALL generate a JSON Schema file at `__generated__/axm-lock.schema.json` from the Effect schema.

#### Scenario: JSON schema matches Effect schema

- **WHEN** running schema generation
- **THEN** `axm-lock.schema.json` is created with matching structure and constraints
