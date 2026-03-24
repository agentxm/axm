## MODIFIED Requirements

### Requirement: Registry directory structure

The registry SHALL use a static-file layout organized by profile, extension type, and name:

```
<registry-root>/
  extensions/
    @<profile>/
      <skills|mcp-servers|packs>/
        <name>/
          index.json
          <version>.zip
```

#### Scenario: Skill extension path

- **WHEN** a skill `@acme/code-review` version `1.0.0` is published
- **THEN** the archive is stored at `<root>/extensions/@acme/skills/code-review/1.0.0.zip`

#### Scenario: MCP server extension path

- **WHEN** an MCP server `@acme/db-tool` version `2.1.0` is published
- **THEN** the archive is stored at `<root>/extensions/@acme/mcp-servers/db-tool/2.1.0.zip`

#### Scenario: Pack extension path

- **WHEN** a pack `@acme/frontend-tools` version `1.0.0` is published
- **THEN** the archive is stored at `<root>/extensions/@acme/packs/frontend-tools/1.0.0.zip`

#### Scenario: Index file location

- **WHEN** any version of `@acme/code-review` (skill) exists
- **THEN** `<root>/extensions/@acme/skills/code-review/index.json` contains the version index

### Requirement: Extension type as directory segment

The registry layout SHALL include the extension type (`skills`, `mcp-servers`, or `packs`) as a directory segment between profile and name. Extension identity remains `@profile/name` (type is not part of identity).

#### Scenario: Same name, different types coexist

- **WHEN** skill `@acme/helper` and MCP server `@acme/helper` are both published
- **THEN** they occupy separate directories: `@acme/skills/helper/` and `@acme/mcp-servers/helper/`

#### Scenario: Client constructs path from extension type

- **WHEN** `skills install @acme/code-review` is run
- **THEN** the client uses `skills` as the type segment to construct the registry path

#### Scenario: Pack type segment

- **WHEN** `packs install @acme/frontend-tools` is run
- **THEN** the client uses `packs` as the type segment to construct the registry path

### Requirement: Extension index schema

Each extension SHALL have an `index.json` conforming to the `ExtensionIndex` schema:

- `name`: string (extension name without profile)
- `profile`: string (including `@` prefix)
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
- `dependencies`: optional map of `@profile/name` to semver range
- `engines`: optional map of engine constraints
- `integrity`: archive integrity in SRI format (`sha512-<base64>`)

#### Scenario: Valid index with multiple versions

- **WHEN** `index.json` contains `name: "code-review"`, `profile: "@acme"`, `type: "skill"`, and two version entries
- **THEN** schema validation succeeds and versions are ordered newest first

#### Scenario: Valid pack index

- **WHEN** `index.json` contains `name: "frontend-tools"`, `profile: "@acme"`, `type: "pack"`, and one version entry
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
