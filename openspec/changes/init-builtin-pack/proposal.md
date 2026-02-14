## Why

After `axm init`, users have no skills installed and no guidance on how to manage their extensions. A bundled extension pack (`@axm/cli`) would give every workspace immediate access to management skills — teaching the agent how to install, update, uninstall, and configure each extension type using axm CLI commands. This makes axm self-documenting from the first interaction.

## What Changes

- **Bundled skill definitions**: Ship SKILL.md files for each management skill inside the CLI distribution (e.g., `@axm/axm-manage-skills`, `@axm/axm-manage-packs`). Each skill contains agent instructions for performing operations via `axm` CLI commands.
- **Bundled pack manifest**: Ship an `axm-pack.json` manifest for `@axm/cli` that references the bundled skills.
- **Builtin pack as implicit dependency**: The `@axm/cli` pack is an implicit built-in dependency of every workspace. It is never written to settings.json, but is recorded in the lockfile with a `"builtin"` source type. `axm init` materializes the bundled skills into the workspace (no registry connectivity required).
- **Builtin as a source type**: `"builtin"` is a source type like `"registry"` or `"github"`. The update flow handles it uniformly — comparing the locked version against the current CLI version, re-materializing skills when the CLI is upgraded.

## Capabilities

### New Capabilities

- `builtin-pack`: The `@axm/cli` pack as an implicit built-in workspace dependency — not in settings but recorded in lockfile with `"builtin"` source type, materialized at init from bundled assets without registry, updated via `axm update` when CLI version changes.
- `builtin-skills`: Skill definitions for managing each extension type (`axm-manage-skills`, `axm-manage-packs`, `axm-manage-mcp-servers`, `axm-manage-commands`) — their content, structure, and bundling with the CLI.

### Modified Capabilities

- `cli-init`: Init handler installs the builtin pack as part of workspace initialization.
- `skills-update`: Update flow handles `"builtin"` source type — compares locked version against CLI version, re-materializes on upgrade, adds/removes skills when manifest changes.

## Impact

- **Init handler** (`packages/cli/src/cli-commands/init/handler.ts`): Gains builtin pack installation step.
- **CLI distribution** (`packages/cli/`): New bundled assets (SKILL.md files, pack manifest) included in npm package.
- **Builtin-pack module** (`packages/cli/src/builtin-pack/`): New module — owns identity constants, bundled asset resolution, and pack manifest reading.
- **Lockfile schema** (`packages/cli/src/lockfile/schema.ts`): New `"builtin"` variant in `SkillLockEntrySchema` and `PackLockEntrySchema` unions.
- **Skills update** (`packages/cli/src/cli-commands/skills/update/`): Handles `"builtin"` source type in version comparison and plan building.
