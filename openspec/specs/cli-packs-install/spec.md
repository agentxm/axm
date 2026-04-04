## MODIFIED Requirements

### Requirement: Cascading extension install

When a pack is installed, the system SHALL build a plan that includes install operations for all extensions referenced in the pack manifest, including skills, commands, and MCP servers.

Pack manifest dependency keys SHALL use the three-segment FQN format (`@owner/type-plural/name`). These keys SHALL be written to the pack's `resolvedSkills`, `resolvedCommands`, and `resolvedMcpServers` maps in the lockfile.

The pack install handler SHALL build extension refs from the pack ref's resolved extension maps and pass them to the plan builder as install operations. Extension refs SHALL use the pack's registry source and empty integrity (skip validation -- trust the pack's source).

Pack skill dependencies SHALL be installed to disk (canonical location + agent symlinks) and written to the skills lock map, but SHALL NOT be added to `settings.json`. Settings is reserved for user-intent entries only.

Pack command dependencies SHALL be installed to disk (canonical location) and written to the commands lock map, but SHALL NOT be added to `settings.json`.

Pack MCP server dependencies SHALL be installed to disk (canonical location) and written to the MCP servers lock map, but SHALL NOT be added to `settings.json`.

Extensions already installed in the workspace SHALL be re-applied idempotently (producing a success result) rather than skipped. There is no `skip` state in the plan.

#### Scenario: All referenced extensions installed

- **WHEN** pack `@acme/packs/frontend-pack` references skills `@acme/skills/code-review: "^1.0.0"` and `@acme/skills/linting: "^2.0.0"`, and command `@acme/commands/formatter: "^1.0.0"` in its manifest
- **AND** none of these extensions are currently installed
- **THEN** the plan includes an install operation for the pack, both skills, and the command
- **AND** both skills are added to the lockfile skills section
- **AND** the command is added to the lockfile commands section
- **AND** no extensions are added to `settings.json`

#### Scenario: Already installed extension re-applied idempotently

- **WHEN** pack `@acme/packs/frontend-pack` references skill `@acme/skills/code-review: "^1.0.0"`
- **AND** `code-review` is already installed at version `1.2.0`
- **THEN** the plan includes an install operation for the pack and for `code-review`
- **AND** the `code-review` install operation produces a success result (idempotent re-apply)

#### Scenario: Extensions installed to configured agents

- **WHEN** a pack is installed
- **THEN** all referenced skill extensions are installed to all agents configured in the workspace
- **AND** command and MCP server extensions are installed to the workspace (no agent symlinks)
- **AND** no `--agent` flag is needed or accepted

#### Scenario: Plan ordering -- pack first, then extensions

- **WHEN** the pack install plan is built
- **THEN** the pack install step SHALL appear first
- **AND** skill, command, and mcp-server install steps SHALL appear after the pack step

#### Scenario: Extension refs built from pack resolved maps

- **WHEN** the pack ref contains `pack.skills: { "@acme/skills/code-review": "1.2.0" }`
- **THEN** the handler SHALL build a registry skill ref with owner `@acme`, name `code-review`, version `1.2.0`, and empty integrity
- **AND** the ref's source SHALL be the pack's registry source

#### Scenario: Dependency extensions installed without user version constraint

- **WHEN** pack `@acme/packs/frontend-pack` is installed with `--version ^2.0.0`
- **THEN** the pack install operation uses version constraint `^2.0.0`
- **AND** dependency skill/command/mcp-server install operations use no version constraint
