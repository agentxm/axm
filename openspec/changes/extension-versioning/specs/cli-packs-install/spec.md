## MODIFIED Requirements

### Requirement: Cascading extension install

When a pack is installed, the system SHALL build a plan that includes install operations for all extensions referenced in the pack manifest that are not already installed.

Pack skill dependencies SHALL be written to the skills lock map (for physical install tracking) and the pack's `resolvedSkills` (for ownership), but SHALL NOT be added to `settings.json`. Settings is reserved for user-intent entries only.

Extensions already installed in the workspace SHALL be skipped (no-op).

#### Scenario: All referenced extensions installed

- **WHEN** pack `@acme/frontend-pack` references skills `@acme/code-review@^1.0.0` and `@acme/linting@^2.0.0`
- **AND** neither skill is currently installed
- **THEN** the plan includes `install-pack` for the pack AND `install-skill` for both skills
- **AND** both skills are added to the lockfile skills section
- **AND** neither skill is added to `settings.json`

#### Scenario: Some extensions already installed

- **WHEN** pack `@acme/frontend-pack` references skill `@acme/code-review@^1.0.0`
- **AND** `@acme/code-review` version `1.2.0` is already installed
- **THEN** the plan includes `install-pack` for the pack
- **AND** `@acme/code-review` shows as no-op in the plan

#### Scenario: Extensions installed to configured agents

- **WHEN** a pack is installed
- **THEN** all referenced extensions are installed to all agents configured in the workspace
- **AND** no `--agent` flag is needed or accepted

### Requirement: Pack manifest version constraints applied during install

When installing a pack's skill dependencies, the system SHALL use the version constraints from the pack manifest to resolve each dependency.

#### Scenario: Pack manifest constraint used for resolution

- **WHEN** pack `@acme/frontend-pack` declares `skills: { "@acme/code-review": "^1.0.0" }`
- **AND** available versions are 1.0.0, 1.2.0, 1.4.0, 2.0.0
- **THEN** the skill SHALL be resolved to version 1.4.0 (newest satisfying `^1.0.0`)

#### Scenario: Pack manifest wildcard resolves latest

- **WHEN** pack `@acme/frontend-pack` declares `skills: { "@acme/code-review": "*" }`
- **THEN** the skill SHALL be resolved to the newest available version

### Requirement: Install pack with version constraint

`axm packs install` SHALL persist the version constraint from the source string into settings.

#### Scenario: Install pack with version constraint

- **WHEN** user runs `axm packs install @acme/frontend-tools@^2.0.0`
- **THEN** the settings entry SHALL be `"@acme/frontend-tools@^2.0.0"`
- **AND** the lockfile SHALL record the exact resolved version

#### Scenario: Install pack without version constraint

- **WHEN** user runs `axm packs install @acme/frontend-tools`
- **THEN** the settings entry SHALL be `"@acme/frontend-tools"` (no version, implies `*`)
