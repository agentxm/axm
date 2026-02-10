# registry-layout Specification

## Purpose

Defines the static-file directory structure and schemas for extension registries.

## Requirements

### Requirement: Registry directory structure

The registry SHALL use a static-file layout organized by scope, extension type, and name:

```
<registry-root>/
  extensions/
    @<scope>/
      <skills|mcp-servers>/
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

#### Scenario: Index file location

- **WHEN** any version of `@acme/code-review` (skill) exists
- **THEN** `<root>/extensions/@acme/skills/code-review/index.json` contains the version index

### Requirement: Extension type as directory segment

The registry layout SHALL include the extension type (`skills` or `mcp-servers`) as a directory segment between scope and name. Extension identity remains `@scope/name` (type is not part of identity).

#### Scenario: Same name, different types coexist

- **WHEN** skill `@acme/helper` and MCP server `@acme/helper` are both published
- **THEN** they occupy separate directories: `@acme/skills/helper/` and `@acme/mcp-servers/helper/`

#### Scenario: Client constructs path from extension type

- **WHEN** `skills install @acme/code-review` is run
- **THEN** the client uses `skills` as the type segment to construct the registry path

### Requirement: Extension index schema

Each extension SHALL have an `index.json` conforming to the `ExtensionIndex` schema:

- `name`: string (extension name without scope)
- `scope`: string (including `@` prefix)
- `type`: `"skill" | "mcp-server"`
- `description`: optional string
- `repository`: optional string
- `license`: optional string
- `authors`: optional array of `{name, email?, url?}`
- `versions`: array of `VersionEntry` (newest first)

#### Scenario: Valid index with multiple versions

- **WHEN** `index.json` contains `name: "code-review"`, `scope: "@acme"`, `type: "skill"`, and two version entries
- **THEN** schema validation succeeds and versions are ordered newest first

#### Scenario: Missing required field

- **WHEN** `index.json` is missing the `name` field
- **THEN** schema validation fails with a parse error

### Requirement: Version entry schema

Each entry in the `versions` array SHALL conform to the `VersionEntry` schema:

- `version`: string (semver)
- `published`: string (ISO 8601)
- `agents`: array of strings (agent identifiers, not validated against exhaustive list)
- `dependencies`: optional record of `@scope/name` to semver range
- `engines`: optional record (e.g., `{"axm": ">=0.2.0"}`)
- `checksum`: string (`sha256:<hex>`)

#### Scenario: Valid version entry

- **WHEN** a version entry has `version: "1.0.0"`, `published: "2025-01-15T00:00:00Z"`, `agents: ["claude-code"]`, `checksum: "sha256:abc123"`
- **THEN** schema validation succeeds

#### Scenario: Agent IDs are forward-compatible strings

- **WHEN** a version entry has `agents: ["claude-code", "future-agent-2025"]`
- **THEN** schema validation succeeds (agent IDs are not validated against a fixed list)

### Requirement: Archive format

Extension archives SHALL be zip files containing extension files at the root (no enclosing directory).

#### Scenario: Archive contents at root level

- **WHEN** a skill archive is extracted
- **THEN** `axm-skill.json`, `SKILL.md`, and other files appear at the top level (not nested in a subdirectory)

#### Scenario: Archive naming convention

- **WHEN** version `1.2.3` of an extension is archived
- **THEN** the archive file is named `1.2.3.zip`
