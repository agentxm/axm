## Context

The pack install handler (`packages/cli/src/cli-commands/packs/install/handler.ts`) is a 400-line function that does everything: parse source, fetch pack archive, extract to disk, read manifest, resolve each skill dependency from the registry, build plan, and execute. This makes it hard to test, hard to reuse, and couples the handler to registry fetch mechanics.

The registry already has a `dependencies` field on `VersionEntry` (in `local-schema.ts`) and `RegistryExtensionManifest` (in `client.ts`). For skills, this is populated. For packs, it's not — pack publish creates `VersionEntry` without dependencies. The `toExtensionRef` function in `host-provider.ts` also drops dependencies when mapping pack entries to `PackExtensionRef`.

The data pipeline already exists; it just needs to be connected for packs.

## Goals / Non-Goals

**Goals:**

- Handler becomes a thin orchestrator: parse input → resolve PackExtensionRef → build plan → execute
- PackExtensionRef carries pack manifest dependency data from the registry (no separate fetch/parse)
- install-pack operation handles fetch, extract, and disk writes
- Input simplified to `@scope/packs/pack-name` or `pack-name` (with default scope)

**Non-Goals:**

- Backward compatibility with old input formats (`@scope/pack-name` without `/packs/`)
- Changing the lockfile or settings schema
- Modifying uninstall or update flows

## Decisions

### 1. Pack dependencies flow through RegistryExtensionManifest → PackExtensionRef

**Decision**: Add a `dependencies` field to `PackExtensionRefBase` carrying the pack manifest's extension map (skills, commands, mcp-servers). The registry already has this data — pack publish writes it to `VersionEntry.dependencies`, the local client reads it into `RegistryExtensionManifest.dependencies`, and `toExtensionRef` passes it through to the ref.

**Why not a separate manifest type on the ref?** The `dependencies` field on `RegistryExtensionManifest` is already a flat `Record<string, string>` — same shape as the pack manifest's skills/commands/mcp-servers. Since packs are the only extension type with structured dependencies, a single `dependencies` field on the pack ref (mirroring the manifest structure with `skills`, `commands`, `mcp-servers` keys) is sufficient.

**Shape on PackExtensionRefBase:**

```typescript
readonly pack: {
  readonly name: string;
  readonly skills: Readonly<Record<string, string>>;      // @scope/skills/name → version constraint
  readonly commands: Readonly<Record<string, string>>;    // @scope/commands/name → version constraint
  readonly mcpServers: Readonly<Record<string, string>>;  // @scope/mcp-servers/name → version constraint
};
```

**Alternative considered**: Nesting under a `dependencies` property. Rejected as unnecessary indirection — the pack ref itself is the context, so `pack.skills` is clear without a `pack.dependencies.skills` wrapper.

### 2. Pack publish populates VersionEntry.dependencies

**Decision**: When publishing a pack, flatten the manifest's skills/commands/mcp-servers into the `VersionEntry.dependencies` field as `{ "@scope/skills/name": "^1.0.0", "@scope/commands/name": "^2.0.0", "@scope/mcp-servers/name": "^1.5.0" }`. The type prefix (`skills/`, `commands/`, `mcp-servers/`) is included in the key to disambiguate.

**Why this encoding?** `VersionEntry.dependencies` is already `Record<string, string>`. Using `@scope/<type-plural>/<name>` as keys preserves the extension type without changing the schema. This mirrors the registry directory layout (`extensions/@scope/skills/name/`).

**Decoding in toExtensionRef**: When mapping a pack's `RegistryExtensionManifest` to `PackExtensionRef`, partition the flat dependency keys by type prefix (`@scope/skills/`, `@scope/commands/`, `@scope/mcp-servers/`) into the structured `{ skills, commands, mcpServers }` maps. Keys are preserved as-is (full FQN with type segment).

### 3. Handler only resolves the PackExtensionRef

**Decision**: The handler parses input, calls `sources.find()` to get a `PackExtensionRef` (which already carries dependencies from the registry), then passes the ref to `buildInstallPlan`. The plan builder is responsible for constructing all operations: an `InstallPackOperation` for the pack itself plus `InstallSkillOperation`s (and equivalent for commands/mcp-servers) for each dependency in the ref. The handler then executes the plan. No fetch, no extract, no manifest read in the handler.

**install-pack operation gains**: Fetching the pack archive, extracting to the managed location, and writing lockfile/settings entries. This is where `sources.fetch()` moves to. The install-pack operation does NOT construct or execute dependency install operations — that responsibility stays with `buildInstallPlan`.

### 4. Input format: `@scope/packs/pack-name` or `pack-name`

**Decision**: Accept two input patterns:

- `@scope/packs/pack-name` — fully qualified, used as-is
- `pack-name` — resolved to `@defaultScope/packs/pack-name` using the workspace's configured scope

Remove support for `@scope/pack-name` (ambiguous — could be a skill). The `/packs/` segment makes intent explicit.

**Version constraints**: Appended as before — `@scope/packs/pack-name@^2.0.0` or `pack-name@^2.0.0`.

## Risks / Trade-offs

**Registry schema encoding** — Using `@scope/<type-plural>/<name>` keys in `VersionEntry.dependencies` is a convention, not schema-enforced. → Validate at decode time in `toExtensionRef`; malformed keys produce a `CliError`.

**Existing published packs lack dependencies** — Packs published before this change won't have dependencies in the registry index. → The install-pack operation falls back to reading the manifest from the extracted archive if `pack.dependencies` is empty. This provides a migration path without requiring republishing.

**Breaking input format** — Removing `@scope/pack-name` support. → Backward compatibility is a non-goal per project rules. Document the change.
