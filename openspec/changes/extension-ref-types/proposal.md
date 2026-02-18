## Why

The current `SourceExtensionRef` union is a flat cartesian product of extension types × source types, producing 14 individually-named type aliases (e.g., `GitHubSkillRef`, `GitLabSkillRef`, `RegistrySkillRef`, ...). Each new source or extension type causes combinatorial explosion. There's no shared generic base, making it hard to write generic code over refs — consumers must switch on `source.type` across 8 variants when they only care about 2-3 ref categories (git-hosted, registry, local, builtin). Introducing a `refType` discriminator and generic base types will collapse the combinatorics and make refs easier to construct, consume, and extend.

## What Changes

- **BREAKING** Introduce `ExtensionRefBase<TExtensionType, TRefType, TSource>` as the generic foundation for all extension refs
- **BREAKING** Introduce a `refType` discriminator (`"git-hosted"`, `"registry"`, `"local"`, `"builtin"`) that groups source types by hosting category — replacing the per-source-type ref variants
- **BREAKING** Restructure skill, mcp-server, and pack refs using layered generics: `ExtensionRefBase` → `SkillExtensionRefBase<TRefType, TSource>` → concrete types like `GitHostedSkillExtensionRef`
- **BREAKING** Collapse git hosting variants (GitHub, GitLab, Bitbucket, AzureRepos, Git) into a single `git-hosted` ref type — the specific host is still available via `source.type` but doesn't multiply the ref type space
- Remove individually-named per-source ref types (`GitHubSkillRef`, `GitLabSkillRef`, etc.) in favor of generic compositions
- Ref detail interfaces (`GitHostedRefDetails`, `RegistryRefDetails`, etc.) are absorbed into the generic ref structure

## Capabilities

### New Capabilities

- `extension-ref-types`: Generic `ExtensionRef` type hierarchy with `ExtensionRefBase`, per-extension-type bases, and per-ref-type concrete types. Defines the `refType` discriminator and how extension-specific metadata, source, and ref details compose.

### Modified Capabilities

- `source-provider`: `find()` return type changes from `ReadonlyArray<SourceExtensionRef>` to use the new `ExtensionRef` union.

## Impact

- `packages/cli/src/sources/types.ts` — primary change site: ref types, ref detail interfaces, unions
- All consumers of `SourceExtensionRef`, `SkillExtensionRef`, `McpServerExtensionRef`, `PackExtensionRef` — need to switch on `refType` instead of `source.type` for ref-category logic
- `packages/cli/src/cli-commands/skills/source-to-lock-entry.ts` — switches on source type to build lock entries
- `packages/cli/src/cli-commands/skills/operations.ts` — uses `SkillExtensionRef`
- All source host provider `find()` implementations — construct ref objects with new shape
- Lockfile schema and conversion logic — may need alignment with new ref structure
