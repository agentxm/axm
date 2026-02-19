## Why

Extensions today are managed individually — each skill, command, or MCP server is installed and configured one at a time. There's no way to bundle a curated set of extensions into a reusable, distributable unit. Extension packs solve this by letting authors compose multiple extensions into a single installable package that can be published to and installed from registries.

## What Changes

- New **extension pack** concept: a managed, registry-only extension type that references other managed, registry-sourced extensions (skills, commands, mcp-servers)
- New **pack manifest** (`axm-pack.json`) with entries mirroring workspace settings (skills, commands, mcp-servers) plus pack metadata
- New **`axm packs` CLI command group** with subcommands:
  - `axm packs new` — scaffold a new pack locally
  - `axm packs install` — install a pack from a registry (and its referenced extensions)
  - `axm packs uninstall` — uninstall a pack (and extensions it brought in, if not otherwise referenced)
  - `axm packs add` — add a managed, registry-sourced extension to a pack (supports glob patterns to match workspace extensions, e.g., `"effect-*"`)
  - `axm packs remove` — remove an extension from a pack
  - `axm packs publish` — publish a pack to a registry
  - `axm packs unpack` — install all of a pack's extensions directly into workspace settings (as individual entries in skills, commands, mcp-servers)
- Packs are **always managed** (stored in `.axm/extensions/@<namespace>/packs/<name>/`) and **registry-only** (no GitHub, git, or local sources)

## Capabilities

### New Capabilities

- `extension-packs`: Pack manifest schema, directory structure, and lifecycle (create, install, uninstall). Packs are managed extensions containing a manifest that references other registry-sourced extensions.
- `cli-packs-new`: `axm packs new` command — scaffold a new empty pack with manifest
- `cli-packs-install`: `axm packs install` command — install a pack and its referenced extensions from a registry
- `cli-packs-uninstall`: `axm packs uninstall` command — uninstall a pack and its orphaned extensions
- `cli-packs-add`: `axm packs add` command — add a managed, registry-sourced extension to an existing pack. Supports glob patterns (e.g., `"effect-*"`) to match against installed workspace extensions
- `cli-packs-remove`: `axm packs remove` command — remove an extension from a pack
- `cli-packs-publish`: `axm packs publish` command — publish a pack to a registry
- `cli-packs-unpack`: `axm packs unpack` command — flatten a pack's extensions into workspace settings as individual entries

### Modified Capabilities

- `registry-layout`: Add `packs` as a supported extension type directory segment alongside `skills` and `mcp-servers`
- `managed-extensions`: Extend to cover packs as a managed extension type with their own manifest (`axm-pack.json`)

## Impact

- **Settings**: `packs` field exists in settings schema as generic `ExtensionMap` — needs a specifically typed `PacksMap` (similar to how skills uses `SkillsMap` with skill-specific entry types)
- **Registry**: Layout needs new `packs/` directory segment; publish flow needs pack type support
- **Workspace**: Plan building and execution need pack-aware operations (install/uninstall with transitive extension handling)
- **CLI**: New `packs` command group under `axm` alongside existing `skills` command group
- **Extension resolution**: Constrained to registry sources only for packs — no GitHub/git/local resolution
