## Requirements

### Requirement: Install pack from registry

`axm packs install <source>` SHALL install a pack from a registry and all its referenced extensions.

The source SHALL be a registry reference (`@namespace/packs/name`, `@namespace/packs/name@version`, or bare name with implied namespace and type). Non-registry sources SHALL be rejected.

#### Scenario: Install pack by fully qualified name

- **WHEN** user runs `axm packs install @acme/packs/frontend-tools`
- **THEN** the pack is fetched from the registry
- **AND** the pack manifest is written to `.axm/extensions/@acme/packs/frontend-tools/axm-pack.json`
- **AND** a pack entry is added to settings.json
- **AND** a pack lock entry is added to the lockfile `packs` section

#### Scenario: Install pack with version specifier

- **WHEN** user runs `axm packs install @acme/packs/frontend-tools@^2.0.0`
- **THEN** the latest version matching `^2.0.0` is resolved and installed

#### Scenario: Install pack with bare name

- **WHEN** user runs `axm packs install frontend-tools`
- **AND** workspace namespace is `@acme`
- **THEN** the pack is resolved as `@acme/packs/frontend-tools`

#### Scenario: Non-registry source rejected

- **WHEN** user runs `axm packs install github:owner/repo`
- **THEN** the command fails with a `CliError` indicating packs only support registry sources

### Requirement: Cascading extension install

When a pack is installed, the system SHALL build a plan that includes install operations for all extensions referenced in the pack manifest that are not already installed.

Pack manifest dependency keys SHALL use the three-segment FQN format (`@namespace/type-plural/name`). These keys SHALL be written to the pack's `resolvedSkills`, `resolvedCommands`, and `resolvedMcpServers` maps in the lockfile.

The pack install handler SHALL build extension refs from the pack ref's resolved extension maps and pass them to the plan builder as install operations. Extension refs SHALL use the pack's registry source and empty integrity (skip validation — trust the pack's source).

Pack skill dependencies SHALL be installed to disk (canonical location + agent symlinks) and written to the skills lock map, but SHALL NOT be added to `settings.json`. Settings is reserved for user-intent entries only.

Pack command dependencies SHALL be installed to disk (canonical location) and written to the commands lock map, but SHALL NOT be added to `settings.json`.

Pack MCP server dependencies SHALL be installed to disk (canonical location) and written to the MCP servers lock map, but SHALL NOT be added to `settings.json`.

Extensions already installed in the workspace SHALL be skipped (no-op).

#### Scenario: All referenced extensions installed

- **WHEN** pack `@acme/packs/frontend-pack` references skills `@acme/skills/code-review: "^1.0.0"` and `@acme/skills/linting: "^2.0.0"`, and command `@acme/commands/formatter: "^1.0.0"` in its manifest
- **AND** none of these extensions are currently installed
- **THEN** the plan includes `install-pack` for the pack, `install-skill` for both skills, and `install-command` for the command
- **AND** both skills are added to the lockfile skills section
- **AND** the command is added to the lockfile commands section
- **AND** no extensions are added to `settings.json`

#### Scenario: Some extensions already installed

- **WHEN** pack `@acme/packs/frontend-pack` references skill `@acme/skills/code-review: "^1.0.0"`
- **AND** `code-review` is already installed at version `1.2.0`
- **THEN** the plan includes `install-pack` for the pack
- **AND** `code-review` shows as no-op in the plan

#### Scenario: Extensions installed to configured agents

- **WHEN** a pack is installed
- **THEN** all referenced skill extensions are installed to all agents configured in the workspace
- **AND** command and MCP server extensions are installed to the workspace (no agent symlinks)
- **AND** no `--agent` flag is needed or accepted

#### Scenario: Plan ordering — pack first, then extensions

- **WHEN** the pack install plan is built
- **THEN** the `install-pack` step SHALL appear first
- **AND** `install-skill`, `install-command`, and `install-mcp-server` steps SHALL appear after the pack step

#### Scenario: Extension refs built from pack resolved maps

- **WHEN** the pack ref contains `pack.skills: { "@acme/skills/code-review": "1.2.0" }`
- **THEN** the handler SHALL build a `RegistrySkillRef` with namespace `@acme`, name `code-review`, version `1.2.0`, and empty integrity
- **AND** the ref's source SHALL be the pack's registry source

### Requirement: Pack manifest version constraints applied during install

When installing a pack's skill dependencies, the system SHALL use the version constraints from the pack manifest to resolve each dependency. Pack manifest dependency keys SHALL use the three-segment FQN format.

#### Scenario: Pack manifest constraint used for resolution

- **WHEN** pack `@acme/packs/frontend-pack` declares `skills: { "@acme/skills/code-review": "^1.0.0" }`
- **AND** available versions are 1.0.0, 1.2.0, 1.4.0, 2.0.0
- **THEN** the skill SHALL be resolved to version 1.4.0 (newest satisfying `^1.0.0`)

#### Scenario: Pack manifest wildcard resolves latest

- **WHEN** pack `@acme/packs/frontend-pack` declares `skills: { "@acme/skills/code-review": "*" }`
- **THEN** the skill SHALL be resolved to the newest available version

### Requirement: Pack lock entry records resolved versions

After successful install, the pack lock entry SHALL record the exact resolved versions of all referenced extensions using three-segment FQN keys in `resolvedSkills`, `resolvedCommands`, and `resolvedMcpServers` fields.

Each stored value in `resolvedSkills`, `resolvedCommands`, and `resolvedMcpServers` MUST be an exact semver version (for example, `1.2.3`) and MUST NOT be a semver range (for example, `^1.2.0`, `~1.2.0`, `>=1.0.0 <2.0.0`, or `*`).

#### Scenario: Resolved versions recorded with FQN keys

- **WHEN** pack `@acme/packs/frontend-pack` with `skills: { "@acme/skills/code-review": "^1.0.0" }` is installed
- **AND** version `1.2.0` of `@acme/skills/code-review` is resolved
- **THEN** the pack lock entry contains `resolvedSkills: { "@acme/skills/code-review": "1.2.0" }`

#### Scenario: Range value in pack resolved maps is rejected

- **WHEN** a pack lock entry would store `resolvedSkills: { "@acme/skills/code-review": "^1.0.0" }`
- **THEN** the operation SHALL fail with a `CliError` indicating lockfile resolved values must be exact versions

### Requirement: Packs install participates in cross-extension lockfile reconciliation

`axm packs install` SHALL execute through `resolvePlan` plan augmentation and SHALL participate in cross-extension lockfile reconciliation when lockfile state is `missing` or `invalid`.

The command SHALL use `materialize_if_missing` policy semantics for install operations.

#### Scenario: Missing lockfile augments packs install plan

- **WHEN** user runs `axm packs install <source>`
- **AND** lockfile state is `missing`
- **THEN** the plan SHALL be augmented with cross-extension reconciliation operations before requested pack install operations

#### Scenario: Invalid lockfile augments with warning

- **WHEN** user runs `axm packs install <source>`
- **AND** lockfile state is `invalid`
- **THEN** the plan SHALL be augmented with cross-extension reconciliation + materialization operations
- **AND** warnings SHALL include lockfile parse/validation diagnostics

### Requirement: Reconciliation dedupes overlaps with pack dependencies

When pack-derived extension installs and settings-derived reconciliation installs target the same declaration key, plan augmentation SHALL inject one install operation for that key.

#### Scenario: Pack dependency and settings declaration overlap

- **WHEN** reconciliation derives an install for `@acme/skills/tool@^1`
- **AND** pack install flow derives the same declaration key
- **THEN** augmented plan SHALL include one install operation for that key
