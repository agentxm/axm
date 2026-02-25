## MODIFIED Requirements

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
