## MODIFIED Requirements

### Requirement: Builtin pack lock entry schema

The lockfile SHALL support a `"builtin"` source type for pack lock entries, distinct from `"registry"`.

#### Scenario: Builtin pack lock entry fields

- **WHEN** a builtin pack is recorded in the lockfile
- **THEN** the entry SHALL have fields: `type` ("builtin"), `scope`, `name`, `resolvedVersion`, `installedAt`, `updatedAt`, `resolvedSkills`, `resolvedCommands`, `resolvedMcpServers`
- **AND** SHALL NOT have `integrity` or `sourceName` fields

#### Scenario: Lockfile parses builtin pack entries

- **WHEN** reading a lockfile containing a pack with `type: "builtin"`
- **THEN** the lockfile schema SHALL decode successfully

### Requirement: Builtin skill lock entry schema

The lockfile SHALL support a `"builtin"` source type for skill lock entries, distinct from existing source types.

#### Scenario: Builtin skill lock entry fields

- **WHEN** a skill from the builtin pack is recorded in the lockfile
- **THEN** the entry SHALL have fields: `type` ("builtin"), `agents`, `installedAt`, `updatedAt`
- **AND** SHALL NOT have source-specific fields like `scope`, `owner`, `repo`, `path`, `url`, `integrity`, or `sourceName`

#### Scenario: Lockfile parses builtin skill entries

- **WHEN** reading a lockfile containing a skill with `type: "builtin"`
- **THEN** the lockfile schema SHALL decode successfully
