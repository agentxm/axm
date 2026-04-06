## Requirements

### Requirement: Publish locally managed dependencies with pack

When `--include-dependencies` is provided, `axm packs publish` SHALL read the extension extension pack manifest, identify all dependency extensions (skills, commands, MCP servers), and publish those that are locally managed before publishing the extension pack itself.

#### Scenario: Publish extension pack with locally managed skill dependencies

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --yes`
- **AND** the extension extension pack manifest lists `@acme/skills/code-review: "^1.0.0"` and `@acme/skills/test-runner: "^1.0.0"`
- **AND** both skills exist in `.axm/extensions/@acme/skills/`
- **THEN** both skills are published to the same target registry
- **AND** the extension extension pack is published after the dependencies

#### Scenario: Publish extension pack with mixed extension type dependencies

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --yes`
- **AND** the extension extension pack manifest lists skills, commands, and MCP server dependencies
- **AND** all are locally managed
- **THEN** all dependency extensions are published to the target registry
- **AND** the extension extension pack is published after the dependencies

#### Scenario: Publish extension pack with explicit registry and dependencies

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --registry local --yes`
- **THEN** all locally managed dependencies and the extension pack are published to the `local` registry

### Requirement: Skip non-local dependencies with warning

Dependencies listed in the extension extension pack manifest that do not exist in `.axm/extensions/` SHALL be skipped with a warning. The publish SHALL continue with the remaining dependencies and the extension pack.

#### Scenario: Some dependencies not locally managed

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --yes`
- **AND** the manifest lists `@acme/skills/code-review` and `@external/skills/linter`
- **AND** `@acme/skills/code-review` exists locally but `@external/skills/linter` does not
- **THEN** a warning is logged for `@external/skills/linter`
- **AND** `@acme/skills/code-review` is published
- **AND** the extension extension pack is published

#### Scenario: No dependencies are locally managed

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --yes`
- **AND** none of the manifest dependencies exist locally
- **THEN** warnings are logged for each missing dependency
- **AND** the extension pack is still published (same as without the flag)

### Requirement: Idempotent dependency publishing

Dependency publishing SHALL follow the same idempotency rules as regular extension publishing: same version + same integrity is a no-op, same version + different integrity is an error.

#### Scenario: Dependency already published with same version and integrity

- **WHEN** `--include-dependencies` is used
- **AND** a dependency has already been published with the same version and integrity
- **THEN** the dependency publish is a no-op
- **AND** the extension pack publish continues

### Requirement: Pack with no dependencies

When the extension extension pack manifest has no dependency entries, `--include-dependencies` SHALL have no effect — the extension extension pack is published normally.

#### Scenario: Empty dependencies with flag

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --yes`
- **AND** the extension extension pack manifest has no skills, commands, or MCP server entries
- **THEN** the extension extension pack is published normally with no additional operations

### Requirement: Plan displays dependency publish steps

When `--include-dependencies` is used, the publish plan SHALL include separate steps for each dependency, displayed before the extension pack publish step.

#### Scenario: Preview mode shows dependency steps

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --preview`
- **AND** the extension pack has two locally managed skill dependencies
- **THEN** the plan displays three steps: two dependency publishes and one pack publish
- **AND** the plan is NOT applied
