## MODIFIED Requirements

### Requirement: Install pack from registry

`axm packs install <source>` SHALL install a pack from a registry and all its referenced extensions.

The source SHALL be a registry reference (`@scope/packs/name`, `@scope/packs/name@version`, or bare name with implied scope and type). Non-registry sources SHALL be rejected.

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
- **AND** workspace scope is `@acme`
- **THEN** the pack is resolved as `@acme/packs/frontend-tools`

#### Scenario: Non-registry source rejected

- **WHEN** user runs `axm packs install github:owner/repo`
- **THEN** the command fails with a `CliError` indicating packs only support registry sources

### Requirement: Cascading extension install

When a pack is installed, the system SHALL build a plan that includes install operations for all extensions referenced in the pack manifest that are not already installed.

Pack manifest dependency keys SHALL use the three-segment FQN format (`@scope/type-plural/name`). These keys SHALL be written to the pack's `resolvedSkills`, `resolvedCommands`, and `resolvedMcpServers` maps in the lockfile.

Pack skill dependencies SHALL be written to the skills lock map (for physical install tracking) and the pack's `resolvedSkills` (for ownership), but SHALL NOT be added to `settings.json`. Settings is reserved for user-intent entries only.

Extensions already installed in the workspace SHALL be skipped (no-op).

#### Scenario: All referenced extensions installed

- **WHEN** pack `@acme/packs/frontend-pack` references skills `@acme/skills/code-review: "^1.0.0"` and `@acme/skills/linting: "^2.0.0"` in its manifest
- **AND** neither skill is currently installed
- **THEN** the plan includes `install-pack` for the pack AND `install-skill` for both skills
- **AND** both skills are added to the lockfile skills section
- **AND** neither skill is added to `settings.json`

#### Scenario: Some extensions already installed

- **WHEN** pack `@acme/packs/frontend-pack` references skill `@acme/skills/code-review: "^1.0.0"`
- **AND** `code-review` is already installed at version `1.2.0`
- **THEN** the plan includes `install-pack` for the pack
- **AND** `code-review` shows as no-op in the plan

#### Scenario: Extensions installed to configured agents

- **WHEN** a pack is installed
- **THEN** all referenced extensions are installed to all agents configured in the workspace
- **AND** no `--agent` flag is needed or accepted

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

#### Scenario: Resolved versions recorded with FQN keys

- **WHEN** pack `@acme/packs/frontend-pack` with `skills: { "@acme/skills/code-review": "^1.0.0" }` is installed
- **AND** version `1.2.0` of `@acme/skills/code-review` is resolved
- **THEN** the pack lock entry contains `resolvedSkills: { "@acme/skills/code-review": "1.2.0" }`
