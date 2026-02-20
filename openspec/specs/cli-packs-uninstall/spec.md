## Requirements

### Requirement: Uninstall pack and orphaned extensions

`axm packs uninstall <name>` SHALL remove the pack and any dependency extensions (skills, commands, MCP servers) it brought in that are no longer needed.

The name SHALL support glob patterns to match multiple packs.

The plan builder SHALL compute which extensions to include as uninstall steps:

**For skills** (`uninstall-skill` steps):

1. Collect all skills from the target pack(s)' `resolvedSkills`
2. Exclude skills referenced by any remaining pack's `resolvedSkills` (packs not being removed in this batch)
3. Exclude skills that have a direct entry in project settings (i.e., directly installed by the user)
4. Remaining skills become `uninstall-skill` plan steps

**For commands** (`uninstall-command` steps):

1. Collect all commands from the target pack(s)' `resolvedCommands`
2. Exclude commands referenced by any remaining pack's `resolvedCommands`
3. Exclude commands that have a direct entry in project settings
4. Remaining commands become `uninstall-command` plan steps

**For MCP servers** (`uninstall-mcp-server` steps):

1. Collect all MCP servers from the target pack(s)' `resolvedMcpServers`
2. Exclude MCP servers referenced by any remaining pack's `resolvedMcpServers`
3. Exclude MCP servers that have a direct entry in project settings
4. Remaining MCP servers become `uninstall-mcp-server` plan steps

The plan SHALL order steps with `uninstall-pack` steps first, followed by `uninstall-skill`, `uninstall-command`, and `uninstall-mcp-server` steps.

The `uninstall-pack` operation handler SHALL only remove the pack itself (directory, settings, lockfile). It SHALL NOT detect or remove orphaned extensions — extension removal is delegated to the respective uninstall operation steps in the plan.

#### Scenario: Uninstall pack with dependency skills

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** the pack's `resolvedSkills` contains `@acme/skills/code-review`
- **AND** `@acme/skills/code-review` has no direct settings entry and no other pack references it
- **THEN** the plan includes an `uninstall-pack` step for `@acme/frontend-pack`
- **AND** the plan includes an `uninstall-skill` step for `@acme/skills/code-review`
- **AND** the `uninstall-pack` step appears before the `uninstall-skill` step

#### Scenario: Uninstall pack with dependency commands

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** the pack's `resolvedCommands` contains `@acme/commands/formatter`
- **AND** `@acme/commands/formatter` has no direct settings entry and no other pack references it
- **THEN** the plan includes an `uninstall-command` step for `@acme/commands/formatter`
- **AND** the `uninstall-pack` step appears before the `uninstall-command` step

#### Scenario: Uninstall pack with dependency MCP servers

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** the pack's `resolvedMcpServers` contains `@acme/mcp-servers/db-connector`
- **AND** `@acme/mcp-servers/db-connector` has no direct settings entry and no other pack references it
- **THEN** the plan includes an `uninstall-mcp-server` step for `@acme/mcp-servers/db-connector`

#### Scenario: Uninstall pack with shared skill

- **WHEN** user runs `axm packs uninstall @acme/pack-a`
- **AND** `@acme/skills/code-review` is in `pack-a`'s `resolvedSkills`
- **AND** `@acme/skills/code-review` is also in `pack-b`'s `resolvedSkills`
- **AND** `pack-b` is still installed
- **THEN** the plan includes `uninstall-pack` for `pack-a`
- **AND** `@acme/skills/code-review` is NOT included as an `uninstall-skill` step

#### Scenario: Uninstall pack with shared command

- **WHEN** user runs `axm packs uninstall @acme/pack-a`
- **AND** `@acme/commands/formatter` is in `pack-a`'s `resolvedCommands`
- **AND** `@acme/commands/formatter` is also in `pack-b`'s `resolvedCommands`
- **AND** `pack-b` is still installed
- **THEN** `@acme/commands/formatter` is NOT included as an `uninstall-command` step

#### Scenario: Uninstall pack with directly installed skill

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** the pack's `resolvedSkills` contains `@acme/skills/code-review`
- **AND** `code-review` has a direct entry in project settings (e.g., user ran `axm skills install code-review`)
- **THEN** `@acme/skills/code-review` is NOT included as an `uninstall-skill` step

#### Scenario: Uninstall pack with directly installed command

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** the pack's `resolvedCommands` contains `@acme/commands/formatter`
- **AND** `formatter` has a direct entry in the settings `commands` section
- **THEN** `@acme/commands/formatter` is NOT included as an `uninstall-command` step

#### Scenario: Glob pattern matches multiple packs with shared skill

- **WHEN** user runs `axm packs uninstall "@acme/*"`
- **AND** packs `@acme/pack-a` and `@acme/pack-b` are installed
- **AND** both packs reference `@acme/skills/shared-skill` in their `resolvedSkills`
- **AND** `@acme/skills/shared-skill` has no direct settings entry
- **THEN** the plan includes `uninstall-pack` for both packs
- **AND** the plan includes `uninstall-skill` for `@acme/skills/shared-skill` (since both referencing packs are being removed)

### Requirement: Uninstall removes settings and lockfile entries

After successful uninstall, the pack entry SHALL be removed from both settings.json and the lockfile `packs` section. Extension entries SHALL be removed by the respective uninstall operation handlers (`uninstall-skill`, `uninstall-command`, `uninstall-mcp-server`).

#### Scenario: Clean removal from settings and lockfile

- **WHEN** pack `@acme/frontend-pack` is successfully uninstalled
- **THEN** the `packs` section in settings.json no longer contains `frontend-pack`
- **AND** the `packs` section in the lockfile no longer contains `@acme/frontend-pack`

#### Scenario: Dependency skill removed from lockfile after pack removal

- **WHEN** pack `@acme/frontend-pack` is uninstalled
- **AND** `@acme/skills/code-review` was a dependency skill with no other references
- **THEN** the `uninstall-skill` operation removes `code-review` from the lockfile and disk

#### Scenario: Dependency command removed from lockfile after pack removal

- **WHEN** pack `@acme/frontend-pack` is uninstalled
- **AND** `@acme/commands/formatter` was a dependency command with no other references
- **THEN** the `uninstall-command` operation removes `formatter` from the lockfile and disk
