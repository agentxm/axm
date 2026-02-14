## Why

After `axm init`, users have no skills installed and no guidance on how to manage their extensions. A bundled extension pack (`@axm.sh/cli`) would give every workspace immediate access to management skills — teaching the agent how to install, update, uninstall, and configure each extension type using axm CLI commands. This makes axm self-documenting from the first interaction.

## What Changes

- **Bundled skill definitions**: Ship SKILL.md files for each management skill inside the CLI distribution (e.g., `@axm.sh/axm-manage-skills`, `@axm.sh/axm-manage-packs`). Each skill contains agent instructions for performing operations via `axm` CLI commands.
- **Bundled pack manifest**: Ship an `axm-pack.json` manifest for `@axm.sh/cli` that references the bundled skills.
- **Builtin pack as implicit dependency**: The `@axm.sh/cli` pack is an implicit built-in dependency of every workspace. It is never written to settings.json, but is recorded in the lockfile with a `"builtin"` source type. `axm init` materializes the bundled skills into the workspace (no registry connectivity required).
- **Lifecycle coupled to CLI**: Builtin skills update when the CLI is upgraded, not via registry. `axm skills update` skips builtin skills. Re-running `axm init` after a CLI upgrade refreshes them.
- **Dots in scope names**: **BREAKING** — Update `FullyQualifiedNameSchema` pattern from `/^@[\w-]+\/[\w-]+$/` to allow dots (`.`) in scope segments, enabling scopes like `@axm.sh`.

## Capabilities

### New Capabilities

- `builtin-pack`: The `@axm.sh/cli` pack as an implicit built-in workspace dependency — not in settings but recorded in lockfile with `"builtin"` source type, materialized at init from bundled assets without registry, lifecycle coupled to CLI version.
- `builtin-skills`: Skill definitions for managing each extension type (`axm-manage-skills`, `axm-manage-packs`, `axm-manage-mcp-servers`, `axm-manage-commands`) — their content, structure, and bundling with the CLI.

### Modified Capabilities

- `cli-init`: Init handler installs the builtin pack as part of workspace initialization.
- `extension-sources`: Source parsing and FQN validation updated to allow dots in scope names.

## Impact

- **Init handler** (`packages/cli/src/cli-commands/init/handler.ts`): Gains builtin pack installation step.
- **FQN schema** (`packages/cli/src/extensions/common.ts`): Pattern change affects all extension name validation — manifests, settings, lockfile entries.
- **Source parser** (`packages/cli/src/sources/parser.ts`): Any scope-related patterns need dot support.
- **CLI distribution** (`packages/cli/`): New bundled assets (SKILL.md files, pack manifest) included in npm package.
- **Workspace service** (`packages/cli/src/workspace/service.ts`): Init path gains builtin skill materialization. Builtin pack is recorded in lockfile but not in settings.
- **Lockfile schema** (`packages/cli/src/lockfile/schema.ts`): New `"builtin"` variant in `SkillLockEntrySchema` and `PackLockEntrySchema` unions.
- **Skills update** (`packages/cli/src/cli-commands/skills/update/`): Skips builtin skills.
