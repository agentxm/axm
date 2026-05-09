## Requirements

### Requirement: Publish locally managed dependencies with pack

When `--include-dependencies` is provided, `axm packs publish` SHALL read the pack manifest `dependencies` map, identify all dependency extensions (skills, commands, MCP servers, subagents), and publish those that are locally managed before publishing the pack itself.

#### Scenario: Publish pack with locally managed skill dependencies

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --yes`
- **AND** the pack manifest lists `@acme/skills/code-review: "^1.0.0"` and `@acme/skills/test-runner: "^1.0.0"`
- **AND** both skills exist in `.axm/extensions/@acme/skills/`
- **THEN** both skills are published to the same target registry
- **AND** the pack is published after the dependencies

#### Scenario: Publish pack with mixed extension type dependencies

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --yes`
- **AND** the pack manifest lists skills, commands, MCP server, and subagent dependencies
- **AND** all are locally managed
- **THEN** all dependency extensions are published to the target registry
- **AND** the pack is published after the dependencies

#### Scenario: Publish pack with explicit registry and dependencies

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --registry local --yes`
- **THEN** all locally managed dependencies and the pack are published to the `local` registry

### Requirement: Skip non-local dependencies with warning

Dependencies listed in the pack manifest that do not exist in `.axm/extensions/` SHALL be skipped with a warning. The publish SHALL continue with the remaining dependencies and the pack.

#### Scenario: Some dependencies not locally managed

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --yes`
- **AND** the manifest lists `@acme/skills/code-review` and `@external/skills/linter`
- **AND** `@acme/skills/code-review` exists locally but `@external/skills/linter` does not
- **THEN** a warning is logged for `@external/skills/linter`
- **AND** `@acme/skills/code-review` is published
- **AND** the pack is published

#### Scenario: No dependencies are locally managed

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --yes`
- **AND** none of the manifest dependencies exist locally
- **THEN** warnings are logged for each missing dependency
- **AND** the pack is still published (same as without the flag)

### Requirement: Idempotent dependency publishing

Dependency publishing SHALL follow the same idempotency rules as regular extension publishing: same version + same integrity is a no-op, same version + different integrity is an error.

#### Scenario: Dependency already published with same version and integrity

- **WHEN** `--include-dependencies` is used
- **AND** a dependency has already been published with the same version and integrity
- **THEN** the dependency publish is a no-op
- **AND** the pack publish continues

### Requirement: Pack with no dependencies

When the pack manifest has no dependency entries, publish SHALL fail validation.

#### Scenario: Empty dependencies with flag

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --yes`
- **AND** the pack manifest has an empty `dependencies` map
- **THEN** publish fails validation

### Requirement: Plan displays dependency publish steps

When `--include-dependencies` is used, the publish plan SHALL include separate steps for each dependency, displayed before the pack publish step.

#### Scenario: Preview mode shows dependency steps

- **WHEN** user runs `axm packs publish my-pack --include-dependencies --preview`
- **AND** the pack has two locally managed skill dependencies
- **THEN** the plan displays three steps: two dependency publishes and one pack publish
- **AND** the plan is NOT applied
