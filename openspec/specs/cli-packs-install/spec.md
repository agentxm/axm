## ADDED Requirements

### Requirement: Install pack from registry

`axm packs install <source>` SHALL install a pack from a registry and all its referenced extensions.

The source SHALL be a registry reference (`@scope/name`, `@scope/name@version`, or bare name with implied scope). Non-registry sources SHALL be rejected.

#### Scenario: Install pack by fully qualified name

- **WHEN** user runs `axm packs install @acme/frontend-tools`
- **THEN** the pack is fetched from the registry
- **AND** the pack manifest is written to `.axm/extensions/@acme/packs/frontend-tools/axm-pack.json`
- **AND** a pack entry is added to settings.json
- **AND** a pack lock entry is added to the lockfile `packs` section

#### Scenario: Install pack with version specifier

- **WHEN** user runs `axm packs install @acme/frontend-tools@^2.0.0`
- **THEN** the latest version matching `^2.0.0` is resolved and installed

#### Scenario: Install pack with bare name

- **WHEN** user runs `axm packs install frontend-tools`
- **AND** workspace scope is `@acme`
- **THEN** the pack is resolved as `@acme/frontend-tools`

#### Scenario: Non-registry source rejected

- **WHEN** user runs `axm packs install github:owner/repo`
- **THEN** the command fails with a `CliError` indicating packs only support registry sources

### Requirement: Cascading extension install

When a pack is installed, the system SHALL resolve and fetch each skill listed in the pack manifest's `skills` map from the registry, then build a combined install plan containing the pack operation followed by `install-skill` operations for each dependency.

Skills already installed in the workspace SHALL be shown as no-op in the plan unless `--force` is specified.

Each dependency FQN SHALL be resolved through `resolveSource` to produce a registry source. The resolved skill archives SHALL be fetched concurrently before the plan is built, so that the full plan can be displayed and confirmed before any installation occurs.

Commands and mcp-servers listed in the pack manifest SHALL be stored as metadata in the pack lock entry but SHALL NOT be installed (no install handlers exist for these types yet).

#### Scenario: All referenced skills installed

- **WHEN** pack `@acme/frontend-pack` references skills `@acme/code-review@^1.0.0` and `@acme/linting@^2.0.0`
- **AND** neither skill is currently installed
- **THEN** the plan includes `install-pack` for the pack AND `install-skill` for both skills
- **AND** the pack step appears before the skill steps in the plan

#### Scenario: Some skills already installed

- **WHEN** pack `@acme/frontend-pack` references skill `@acme/code-review@^1.0.0`
- **AND** `@acme/code-review` version `1.2.0` is already installed
- **THEN** the plan includes `install-pack` for the pack
- **AND** `@acme/code-review` shows as no-op in the plan

#### Scenario: Force overwrites existing skills

- **WHEN** user runs `axm packs install @acme/frontend-pack --force`
- **AND** `@acme/code-review` is already installed
- **THEN** `@acme/code-review` is re-fetched and included as a success step in the plan

#### Scenario: Skills installed to configured agents

- **WHEN** a pack is installed
- **THEN** all referenced skills are installed to all agents configured in the workspace

#### Scenario: Commands and mcp-servers stored as metadata only

- **WHEN** pack `@acme/frontend-pack` references commands and mcp-servers
- **THEN** the pack lock entry records them in `resolvedCommands` and `resolvedMcpServers`
- **AND** no install operations are created for commands or mcp-servers

#### Scenario: Dependency fetch failure

- **WHEN** pack `@acme/frontend-pack` references skill `@acme/missing-skill@^1.0.0`
- **AND** the skill cannot be found in the registry
- **THEN** the command fails with a `CliError` before any plan is executed

### Requirement: Install plan display and confirmation

The install plan SHALL be displayed to the user before execution. The plan SHALL show the pack and all referenced extensions with their expected results (success, no-op).

#### Scenario: Preview mode

- **WHEN** user runs `axm packs install @acme/frontend-tools --preview`
- **THEN** the plan is displayed but NOT applied

#### Scenario: Auto-accept

- **WHEN** user runs `axm packs install @acme/frontend-tools --yes`
- **THEN** the plan is applied without prompting for confirmation

#### Scenario: Force overwrite

- **WHEN** user runs `axm packs install @acme/frontend-tools --force`
- **AND** some referenced extensions are already installed
- **THEN** existing extensions are overwritten

### Requirement: Pack lock entry records resolved versions

After successful install, the pack lock entry SHALL record the exact resolved versions of all referenced extensions in `resolvedSkills`, `resolvedCommands`, and `resolvedMcpServers` fields.

#### Scenario: Resolved versions recorded

- **WHEN** pack `@acme/frontend-pack` with `skills: { "@acme/code-review": "^1.0.0" }` is installed
- **AND** version `1.2.0` of `@acme/code-review` is resolved
- **THEN** the pack lock entry contains `resolvedSkills: { "@acme/code-review": "1.2.0" }`
