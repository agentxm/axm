## MODIFIED Requirements

### Requirement: Extension index schema

Each extension SHALL have an `index.json` conforming to the `ExtensionIndex` schema:

- `name`: string (extension name without scope)
- `scope`: string (including `@` prefix)
- `type`: `"skill" | "mcp-server" | "pack"`
- `description`: optional string
- `repository`: optional string
- `license`: optional string
- `authors`: optional array of `{name, email?, url?}`
- `versions`: array of `VersionEntry` (newest first)

Each `VersionEntry` SHALL contain:

- `version`: semver version string
- `published`: ISO 8601 timestamp
- `agents`: array of agent identifier strings
- `dependencies`: optional map of `@scope/name` to semver range
- `engines`: optional map of engine constraints
- `integrity`: archive integrity in SRI format (`sha512-<base64>`)

#### Scenario: Valid index with multiple versions

- **WHEN** `index.json` contains `name: "code-review"`, `scope: "@acme"`, `type: "skill"`, and two version entries
- **THEN** schema validation succeeds and versions are ordered newest first

#### Scenario: Valid pack index

- **WHEN** `index.json` contains `name: "frontend-tools"`, `scope: "@acme"`, `type: "pack"`, and one version entry
- **THEN** schema validation succeeds

#### Scenario: Missing required field

- **WHEN** `index.json` is missing the `name` field
- **THEN** schema validation fails with a parse error

#### Scenario: Version entry integrity format

- **WHEN** a `VersionEntry` is validated
- **THEN** the `integrity` field SHALL be a string in SRI format (`sha512-<base64>`)

#### Scenario: Missing integrity field

- **WHEN** a `VersionEntry` is missing the `integrity` field
- **THEN** schema validation fails
