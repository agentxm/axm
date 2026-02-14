## ADDED Requirements

### Requirement: Builtin pack identity

The system SHALL recognize `@axm.sh/cli` as the builtin extension pack. This pack is an implicit dependency of every workspace — never written to settings.json, but recorded in the lockfile with `type: "builtin"`. Its lifecycle is coupled to the CLI version.

#### Scenario: Builtin pack not in settings

- **WHEN** the builtin pack is installed during init
- **THEN** the system SHALL NOT write an entry for `@axm.sh/cli` to settings.json

#### Scenario: Builtin pack recorded in lockfile

- **WHEN** the builtin pack is installed during init
- **THEN** the system SHALL write a pack lock entry with `type: "builtin"`, `scope: "@axm.sh"`, `name: "cli"`, and `resolvedVersion` set to the current CLI package version

#### Scenario: Builtin pack visible as configured

- **WHEN** querying configured packs via `getConfiguredPacks()`
- **THEN** the builtin pack `@axm.sh/cli` SHALL be included in the result even though it has no settings entry

### Requirement: Builtin pack lock entry schema

The lockfile SHALL support a `"builtin"` type for pack lock entries, distinct from `"registry"`.

#### Scenario: Builtin pack lock entry fields

- **WHEN** a builtin pack is recorded in the lockfile
- **THEN** the entry SHALL have fields: `type` ("builtin"), `scope`, `name`, `resolvedVersion`, `installedAt`, `updatedAt`, `resolvedSkills`, `resolvedCommands`, `resolvedMcpServers`
- **AND** SHALL NOT have `checksum` or `sourceName` fields

#### Scenario: Lockfile parses builtin pack entries

- **WHEN** reading a lockfile containing a pack with `type: "builtin"`
- **THEN** the lockfile schema SHALL decode successfully

### Requirement: Builtin skill lock entry schema

The lockfile SHALL support a `"builtin"` type for skill lock entries, distinct from existing source types.

#### Scenario: Builtin skill lock entry fields

- **WHEN** a skill from the builtin pack is recorded in the lockfile
- **THEN** the entry SHALL have fields: `type` ("builtin"), `agents`, `installedAt`, `updatedAt`
- **AND** SHALL NOT have source-specific fields like `scope`, `owner`, `repo`, `path`, `url`, `checksum`, or `sourceName`

#### Scenario: Lockfile parses builtin skill entries

- **WHEN** reading a lockfile containing a skill with `type: "builtin"`
- **THEN** the lockfile schema SHALL decode successfully

### Requirement: Bundled assets in CLI distribution

The CLI npm package SHALL include bundled SKILL.md files and an `axm-pack.json` manifest for the builtin pack.

#### Scenario: Pack manifest bundled

- **WHEN** the CLI package is distributed
- **THEN** it SHALL include `builtin-pack/axm-pack.json` containing the pack manifest with `name: "@axm.sh/cli"` and references to bundled skills

#### Scenario: Skill files bundled

- **WHEN** the CLI package is distributed
- **THEN** it SHALL include `builtin-pack/skills/<name>/SKILL.md` for each skill referenced in the pack manifest

### Requirement: Builtin pack materialization at init

During workspace initialization, the system SHALL materialize the builtin pack's skills into the workspace without registry connectivity.

#### Scenario: Skills copied to canonical location

- **WHEN** `axm init` runs for a new workspace
- **THEN** the system SHALL copy each bundled skill to `.axm/extensions/@axm.sh/skills/<name>/`

#### Scenario: Skills symlinked to agent directories

- **WHEN** `axm init` runs with agents selected
- **THEN** the system SHALL create symlinks (or copies as fallback) from each agent's skill directory to the canonical skill location

#### Scenario: Skill lock entries written

- **WHEN** `axm init` materializes builtin skills
- **THEN** the system SHALL write skill lock entries with `type: "builtin"` and the `agents` field matching the selected agents

#### Scenario: No registry connectivity required

- **WHEN** `axm init` runs without network access
- **THEN** builtin pack materialization SHALL succeed using bundled assets only

### Requirement: Builtin skills refresh on CLI upgrade

When running `axm init` on an already-initialized workspace, the system SHALL refresh builtin skills if the CLI version has changed.

#### Scenario: CLI version changed since last init

- **WHEN** `axm init` runs and the locked builtin pack `resolvedVersion` differs from the current CLI version
- **THEN** the system SHALL re-materialize bundled skills and update lock entries with the new version

#### Scenario: CLI version unchanged

- **WHEN** `axm init` runs and the locked builtin pack `resolvedVersion` matches the current CLI version
- **THEN** the system SHALL NOT re-materialize builtin skills

### Requirement: Skills update skips builtin skills

`axm skills update` SHALL skip skills with `type: "builtin"` in the lockfile.

#### Scenario: Builtin skills excluded from update

- **WHEN** the user runs `axm skills update`
- **THEN** skills with `type: "builtin"` SHALL NOT be included in the update candidate list
