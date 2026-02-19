# builtin-pack Specification

## Purpose

TBD - created by archiving change init-builtin-pack. Update Purpose after archive.

## Requirements

### Requirement: Builtin pack identity

The system SHALL recognize `@axm/cli` as the builtin extension pack. This pack is an implicit dependency of every workspace — never written to settings.json, but recorded in the lockfile with `type: "builtin"`. Its lifecycle is coupled to the CLI version.

#### Scenario: Builtin pack not in settings

- **WHEN** the builtin pack is installed during init
- **THEN** the system SHALL NOT write an entry for `@axm/cli` to settings.json

#### Scenario: Builtin pack recorded in lockfile

- **WHEN** the builtin pack is installed during init
- **THEN** the system SHALL write a pack lock entry with `type: "builtin"`, `namespace: "@axm"`, `name: "cli"`, and `resolvedVersion` set to the current CLI package version

### Requirement: Builtin pack lock entry schema

The lockfile SHALL support a `"builtin"` source type for pack lock entries, distinct from `"registry"`.

#### Scenario: Builtin pack lock entry fields

- **WHEN** a builtin pack is recorded in the lockfile
- **THEN** the entry SHALL have fields: `type` ("builtin"), `namespace`, `name`, `resolvedVersion`, `installedAt`, `updatedAt`, `resolvedSkills`, `resolvedCommands`, `resolvedMcpServers`
- **AND** SHALL NOT have `integrity` or `sourceName` fields

#### Scenario: Lockfile parses builtin pack entries

- **WHEN** reading a lockfile containing a pack with `type: "builtin"`
- **THEN** the lockfile schema SHALL decode successfully

### Requirement: Builtin skill lock entry schema

The lockfile SHALL support a `"builtin"` source type for skill lock entries, distinct from existing source types.

#### Scenario: Builtin skill lock entry fields

- **WHEN** a skill from the builtin pack is recorded in the lockfile
- **THEN** the entry SHALL have fields: `type` ("builtin"), `agents`, `installedAt`, `updatedAt`
- **AND** SHALL NOT have source-specific fields like `namespace`, `owner`, `repo`, `path`, `url`, `integrity`, or `sourceName`

#### Scenario: Lockfile parses builtin skill entries

- **WHEN** reading a lockfile containing a skill with `type: "builtin"`
- **THEN** the lockfile schema SHALL decode successfully

### Requirement: Bundled assets in CLI distribution

The CLI npm package SHALL include bundled SKILL.md files and an `axm-pack.json` manifest for the builtin pack.

#### Scenario: Pack manifest bundled

- **WHEN** the CLI package is distributed
- **THEN** it SHALL include `builtin-pack/axm-pack.json` containing the pack manifest with `name: "@axm/cli"` and references to bundled skills

#### Scenario: Skill files bundled

- **WHEN** the CLI package is distributed
- **THEN** it SHALL include `builtin-pack/skills/<name>/SKILL.md` for each skill referenced in the pack manifest

### Requirement: Builtin pack materialization at init

During workspace initialization, the system SHALL materialize the builtin pack's skills into the workspace without registry connectivity. Init is first-time only — if the builtin pack is already in the lockfile, init is a no-op for it.

#### Scenario: Skills copied to canonical location

- **WHEN** `axm init` runs for a new workspace
- **THEN** the system SHALL copy each bundled skill to `.axm/extensions/@axm/skills/<name>/`

#### Scenario: Skills symlinked to agent directories

- **WHEN** `axm init` runs with agents selected
- **THEN** the system SHALL create symlinks (or copies as fallback) from each agent's skill directory to the canonical skill location

#### Scenario: Skill lock entries written

- **WHEN** `axm init` materializes builtin skills
- **THEN** the system SHALL write skill lock entries with `type: "builtin"` and the `agents` field matching the selected agents

#### Scenario: No registry connectivity required

- **WHEN** `axm init` runs without network access
- **THEN** builtin pack materialization SHALL succeed using bundled assets only

#### Scenario: Already initialized workspace

- **WHEN** `axm init` runs and the builtin pack is already in the lockfile
- **THEN** the system SHALL NOT re-materialize builtin skills

### Requirement: Update handles builtin source

`axm update` SHALL handle skills with `type: "builtin"` like any other source type — comparing the locked version against the current CLI version and re-materializing when the CLI has been upgraded.

#### Scenario: CLI version newer than locked version

- **WHEN** the user runs `axm update` and the locked builtin pack `resolvedVersion` is older than the current CLI version
- **THEN** the system SHALL re-materialize bundled skills and update lock entries with the new version

#### Scenario: CLI version unchanged

- **WHEN** the user runs `axm update` and the locked builtin pack `resolvedVersion` matches the current CLI version
- **THEN** builtin skills SHALL be reported as up-to-date (no-op)

#### Scenario: New skill added in CLI upgrade

- **WHEN** the user runs `axm update` and the bundled manifest contains a skill not present in the locked `resolvedSkills`
- **THEN** the system SHALL install the new skill and add it to the lock entries

#### Scenario: Skill removed in CLI upgrade

- **WHEN** the user runs `axm update` and the locked `resolvedSkills` contains a skill not present in the bundled manifest
- **THEN** the system SHALL uninstall the removed skill and remove it from the lock entries

### Requirement: Builtin-pack module as single source of truth

The `builtin-pack/` module SHALL export the identity constants and resolution function for the builtin pack. Both init and update consume this module.

#### Scenario: Module exports identity

- **WHEN** importing from the builtin-pack module
- **THEN** it SHALL export `BUILTIN_PACK_FQN` (`"@axm/cli"`), `BUILTIN_PACK_SCOPE` (`"@axm"`), and `BUILTIN_PACK_NAME` (`"cli"`)

#### Scenario: Module resolves bundled manifest

- **WHEN** calling the resolve function from the builtin-pack module
- **THEN** it SHALL return the parsed pack manifest and the current CLI version
