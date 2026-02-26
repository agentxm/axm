## MODIFIED Requirements

### Requirement: Install writes default entry form

The install handler SHALL write the settings entry as a plain string (collapsed form) via `ws.setSkill()`. If the source string includes a version constraint, the full source string including the version SHALL be persisted. Install always implies `enabled: true` and `managed: true`.

The source string SHALL use the three-segment FQN format for registry sources.

#### Scenario: Install writes default entry form

- **WHEN** a skill is installed via `axm install @acme/skills/tool`
- **THEN** `ws.setSkill()` SHALL write the entry as `"@acme/skills/tool"` (plain string, no version)

#### Scenario: Install preserves version constraint

- **WHEN** a skill is installed via `axm install @acme/skills/tool@^1.0.0`
- **THEN** `ws.setSkill()` SHALL write the entry as `"@acme/skills/tool@^1.0.0"` (version constraint preserved in source string)

#### Scenario: Install preserves exact pin

- **WHEN** a skill is installed via `axm install @acme/skills/tool@1.2.3`
- **THEN** `ws.setSkill()` SHALL write the entry as `"@acme/skills/tool@1.2.3"`

### Requirement: Install accepts local file path input

The install handler SHALL accept file path inputs (`./path`, `../path`, `/absolute/path`, `~/path`) as a valid source for skill installation. When a `file-path-pattern` input is provided, the handler SHALL resolve it to a `LocalSource` via `parseLocalPath()` and proceed with the standard discovery, selection, and install flow.

#### Scenario: Install skill from relative path

- **WHEN** a user runs `axm skills install ./my-skills`
- **THEN** the handler SHALL resolve `./my-skills` as a local source, discover skills in that directory, and install them

#### Scenario: Install skill from absolute path

- **WHEN** a user runs `axm skills install /home/user/skills`
- **THEN** the handler SHALL resolve `/home/user/skills` as a local source and install discovered skills

#### Scenario: Install skill from parent-relative path

- **WHEN** a user runs `axm skills install ../shared-skills`
- **THEN** the handler SHALL resolve `../shared-skills` as a local source and install discovered skills

#### Scenario: Install skill from home-relative path

- **WHEN** a user runs `axm skills install ~/my-skills`
- **THEN** the handler SHALL resolve `~/my-skills` as a local source and install discovered skills

### Requirement: Local install persists path as source string

The install handler SHALL persist the original path string as the settings entry via `ws.setSkill()` for locally installed skills.

#### Scenario: Local install writes path to settings

- **WHEN** a skill named `my-tool` is installed from `./my-skills`
- **THEN** `ws.setSkill()` SHALL write the entry with the local path as the source string

### Requirement: Skills install participates in cross-extension lockfile reconciliation

`axm skills install` SHALL execute through `resolvePlan` plan augmentation and SHALL participate in cross-extension lockfile reconciliation when lockfile state is `missing` or `invalid`.

The command SHALL use `materialize_if_missing` policy semantics for install operations.

#### Scenario: Missing lockfile augments skills install plan

- **WHEN** user runs `axm skills install <source>`
- **AND** lockfile state is `missing`
- **THEN** the plan SHALL be augmented with cross-extension reconciliation operations before requested install operations

#### Scenario: Invalid lockfile augments with warning

- **WHEN** user runs `axm skills install <source>`
- **AND** lockfile state is `invalid`
- **THEN** the plan SHALL be augmented with cross-extension reconciliation + materialization operations
- **AND** warnings SHALL include lockfile parse/validation diagnostics

#### Scenario: Existing valid lockfile does not inject reconciliation

- **WHEN** user runs `axm skills install <source>`
- **AND** lockfile state is `ok`
- **THEN** no lockfile-reconciliation operations SHALL be injected
