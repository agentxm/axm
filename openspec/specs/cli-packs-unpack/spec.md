## Requirements

### Requirement: Unpack flattens pack into settings

`axm packs unpack <name>` SHALL promote all of a pack's referenced extensions to direct entries by emitting explicit install operations in the plan, then remove the pack.

The plan SHALL emit:

1. `install-skill` steps for each skill in the pack's `resolvedSkills` (with `skipSettings: false` to create direct settings entries)
2. `install-command` steps for each command in the pack's `resolvedCommands`
3. `install-mcp-server` steps for each MCP server in the pack's `resolvedMcpServers`
4. An `uninstall-pack` step to remove the pack entry from settings, lockfile, and disk

Extensions already directly installed (with an existing settings entry) SHALL be marked as no-op steps in the plan.

Install operations SHALL use empty integrity refs to trigger the idempotent path — the install handlers detect that the canonical directory already exists (from the original pack install) and skip fetching.

#### Scenario: Unpack pack with skills and commands

- **WHEN** user runs `axm packs unpack @acme/frontend-pack`
- **AND** the pack's `resolvedSkills` contains `@acme/skills/code-review` and `@acme/skills/linting`
- **AND** the pack's `resolvedCommands` contains `@acme/commands/formatter`
- **THEN** the plan includes `install-skill` steps for `code-review` and `linting`
- **AND** the plan includes an `install-command` step for `formatter`
- **AND** the plan includes an `uninstall-pack` step for `frontend-pack`
- **AND** after execution, settings.json `skills` section contains entries for `code-review` and `linting`
- **AND** settings.json `commands` section contains entry for `formatter`
- **AND** settings.json `packs` section no longer contains `frontend-pack`

#### Scenario: Existing direct entries preserved as no-ops

- **WHEN** user runs `axm packs unpack @acme/frontend-pack`
- **AND** `@acme/skills/code-review` already has a direct settings entry
- **THEN** the `install-skill` step for `code-review` SHALL be marked as no-op in the plan
- **AND** the existing settings entry SHALL NOT be overwritten

#### Scenario: Extensions remain installed on disk

- **WHEN** a pack is unpacked
- **THEN** all referenced extensions remain on disk in their canonical locations
- **AND** agent symlinks for skills remain intact

#### Scenario: Plan ordering — install ops first, pack removal last

- **WHEN** the unpack plan is built
- **THEN** `install-skill`, `install-command`, and `install-mcp-server` steps SHALL appear before the `uninstall-pack` step
- **AND** extensions are promoted to direct entries before the pack is removed

### Requirement: Unpack removes pack lockfile entry

After unpacking, the pack lock entry SHALL be removed from the lockfile `packs` section via the `uninstall-pack` operation. The individual extension lock entries SHALL remain.

#### Scenario: Lockfile updated after unpack

- **WHEN** pack `@acme/frontend-pack` is successfully unpacked
- **THEN** the `packs` section in the lockfile no longer contains `@acme/frontend-pack`
- **AND** individual skill/command/mcp-server lock entries remain unchanged

### Requirement: Pack must be installed

`axm packs unpack` SHALL fail if the specified pack is not installed.

#### Scenario: Pack not installed

- **WHEN** user runs `axm packs unpack @acme/nonexistent`
- **AND** no pack named `@acme/nonexistent` is installed
- **THEN** the command fails with a `CliError` indicating the pack is not installed
