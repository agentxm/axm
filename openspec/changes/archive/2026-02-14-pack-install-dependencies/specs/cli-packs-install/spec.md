## MODIFIED Requirements

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
- **THEN** the command fails with an `AppError` before any plan is executed
