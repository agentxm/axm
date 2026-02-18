## MODIFIED Requirements

### Requirement: Install pack from registry

`axm packs install <source>` SHALL install a pack from a registry and all its referenced extensions.

The source SHALL be either:

- A fully qualified pack reference: `@scope/packs/pack-name` or `@scope/packs/pack-name@version`
- A bare pack name: `pack-name` or `pack-name@version` (resolved using workspace default scope as `@defaultScope/packs/pack-name`)

Non-registry sources SHALL be rejected.

The handler SHALL resolve a single `PackExtensionRef` (which carries dependency data from the registry), pass it to `buildInstallPlan` to construct the full plan (pack + dependency operations), and execute the plan. The handler SHALL NOT fetch, extract, or parse the pack manifest.

#### Scenario: Install pack by fully qualified name

- **WHEN** user runs `axm packs install @acme/packs/frontend-tools`
- **THEN** the pack is resolved from the registry as a `PackExtensionRef` with dependencies
- **AND** an install plan is built with `install-pack` for the pack and `install-skill` for each skill dependency
- **AND** the plan is executed

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

When a pack is installed, `buildInstallPlan` SHALL be responsible for constructing install operations for all extensions referenced in the `PackExtensionRef.pack.skills/commands/mcpServers`. It SHALL build `InstallSkillOperation`s (and equivalent operations for commands and mcp-servers) directly from the ref's dependency data, then include them alongside the `InstallPackOperation` in the plan.

Neither the handler nor the install-pack operation SHALL fetch or resolve each dependency from the registry — the PackExtensionRef already carries all dependency information needed to construct the operations.

Pack skill dependencies SHALL be written to the skills lock map (for physical install tracking) and the pack's `resolvedSkills` (for ownership), but SHALL NOT be added to `settings.json`. Settings is reserved for user-intent entries only.

Extensions already installed in the workspace SHALL be skipped (no-op).

#### Scenario: All referenced extensions installed

- **WHEN** pack `@acme/packs/frontend-pack` has `pack.skills` containing `{ "@acme/skills/code-review": "^1.0.0", "@acme/skills/linting": "^2.0.0" }`
- **AND** neither skill is currently installed
- **THEN** the plan includes `install-pack` for the pack AND `install-skill` for both skills
- **AND** both skills are added to the lockfile skills section
- **AND** neither skill is added to `settings.json`

#### Scenario: Some extensions already installed

- **WHEN** pack `@acme/packs/frontend-pack` has `pack.skills` containing `{ "@acme/skills/code-review": "^1.0.0" }`
- **AND** `@acme/skills/code-review` version `1.2.0` is already installed
- **THEN** the plan includes `install-pack` for the pack
- **AND** `@acme/skills/code-review` shows as no-op in the plan

#### Scenario: Extensions installed to configured agents

- **WHEN** a pack is installed
- **THEN** all referenced extensions are installed to all agents configured in the workspace
- **AND** no `--agent` flag is needed or accepted

### Requirement: Install-pack operation handles fetch and extract

The `install-pack` operation handler SHALL be responsible for:

1. Fetching the pack archive from the registry via `sources.fetch()`
2. Extracting the archive to the managed location (`.axm/extensions/@scope/packs/pack-name/`)
3. Writing the pack entry to the lockfile and settings

The install-pack operation SHALL NOT construct or execute dependency install operations — that is the handler's responsibility.

#### Scenario: Install-pack operation fetches and extracts

- **WHEN** the install-pack operation is executed
- **THEN** the pack archive is fetched from the registry
- **AND** the archive is extracted to `.axm/extensions/@scope/packs/pack-name/`
- **AND** the pack entry is written to the lockfile `packs` section
- **AND** a pack entry is added to settings.json

### Requirement: Pack manifest version constraints applied during install

When installing a pack's skill dependencies, the system SHALL use the version constraints from the `PackExtensionRef.pack.skills/commands/mcpServers` to construct install operations.

#### Scenario: Pack dependency constraint used for resolution

- **WHEN** pack `@acme/packs/frontend-pack` has `pack.skills` containing `{ "@acme/skills/code-review": "^1.0.0" }`
- **THEN** the skill install operation for `@acme/skills/code-review` SHALL use version constraint `^1.0.0`

#### Scenario: Pack dependency wildcard

- **WHEN** pack `@acme/packs/frontend-pack` has `pack.skills` containing `{ "@acme/skills/code-review": "*" }`
- **THEN** the skill install operation SHALL resolve to the newest available version

### Requirement: Install pack with version constraint

`axm packs install` SHALL persist the version constraint from the source string into settings.

#### Scenario: Install pack with version constraint

- **WHEN** user runs `axm packs install @acme/packs/frontend-tools@^2.0.0`
- **THEN** the settings entry SHALL be `"@acme/packs/frontend-tools@^2.0.0"`
- **AND** the lockfile SHALL record the exact resolved version

#### Scenario: Install pack without version constraint

- **WHEN** user runs `axm packs install @acme/packs/frontend-tools`
- **THEN** the settings entry SHALL be `"@acme/packs/frontend-tools"` (no version, implies `*`)

### Requirement: Install plan display and confirmation

The install plan SHALL be displayed to the user before execution. The plan SHALL show the pack and all referenced extensions with their expected results (success, no-op).

#### Scenario: Preview mode

- **WHEN** user runs `axm packs install @acme/packs/frontend-tools --preview`
- **THEN** the plan is displayed but NOT applied

#### Scenario: Auto-accept

- **WHEN** user runs `axm packs install @acme/packs/frontend-tools --yes`
- **THEN** the plan is applied without prompting for confirmation

#### Scenario: Force overwrite

- **WHEN** user runs `axm packs install @acme/packs/frontend-tools --force`
- **AND** some referenced extensions are already installed
- **THEN** existing extensions are overwritten

### Requirement: Pack lock entry records resolved versions

After successful install, the pack lock entry SHALL record the exact resolved versions of all referenced extensions in `resolvedSkills`, `resolvedCommands`, and `resolvedMcpServers` fields.

#### Scenario: Resolved versions recorded

- **WHEN** pack `@acme/packs/frontend-pack` with `pack.skills` containing `{ "@acme/skills/code-review": "^1.0.0" }` is installed
- **AND** version `1.2.0` of `@acme/skills/code-review` is resolved
- **THEN** the pack lock entry contains `resolvedSkills: { "@acme/skills/code-review": "1.2.0" }`
