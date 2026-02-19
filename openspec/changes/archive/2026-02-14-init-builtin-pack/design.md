## Context

After `axm init`, workspaces start empty — no skills, no guidance. The CLI already manages skills and packs via registry, git, and local sources, but users must know about these commands first. We want `axm init` to automatically provision a set of management skills that teach the agent how to use axm itself.

Today:

- Init creates settings.json + lockfile, detects agents, done.
- Packs are always registry-sourced (`PackLockEntry.type` is `Literal("registry")`).
- Skills are materialized as symlinks (or copies) from canonical paths into each agent's skill directory.

## Goals / Non-Goals

**Goals:**

- Ship management skill definitions (SKILL.md files) bundled with the CLI npm package
- Install `@axm/cli` pack and its skills during `axm init` without registry connectivity
- Record the builtin pack and skills in lockfile with a `"builtin"` source type
- Handle builtin pack/skill updates through `axm update` — same flow as other sources

**Non-Goals:**

- Bundling non-skill extension types (commands, MCP servers) in the initial builtin pack
- Making the builtin pack removable or configurable — it's always present
- Special-casing workspace service or update flow to exclude builtin — it participates like any other source

## What Is NOT Changing

- **Settings schema** — No changes. The builtin pack is never written to settings.
- **Pack install flow** — No changes. Builtin pack is not installable via `axm packs install`.
- **FQN validation** — No changes. `@axm/cli` already passes `/^@[\w-]+\/[\w-]+$/`.
- **Lockfile read/write logic** — Same read/write paths; the new `"builtin"` source type is just another variant in the existing union schemas.

## What IS Changing

- **Lockfile schema** — New `"builtin"` source type variant in both `SkillLockEntrySchema` and `PackLockEntrySchema` unions.
- **Bundled assets** — New files shipped in the CLI npm package.
- **Builtin-pack module** — New module that owns the identity, assets, and resolution logic for the builtin pack.
- **Init path** — After agent selection, materializes builtin skills and writes `"builtin"` lock entries.
- **Update flow** — Handles `"builtin"` source type in version comparison, resolving against CLI bundle.

## Decisions

### 1. Bundled assets live in `packages/cli/src/builtin-pack/`

Source SKILL.md files and the pack manifest live in the source tree under `packages/cli/src/builtin-pack/`. The build copies them to `dist/src/builtin-pack/`, which is included in the npm package via the existing `"files": ["dist/src/"]` config.

**Structure:**

```
packages/cli/src/builtin-pack/
  axm-pack.json                        # Pack manifest for @axm/cli
  skills/
    axm-manage-skills/SKILL.md         # Agent instructions for skill operations
    axm-manage-packs/SKILL.md          # Agent instructions for pack operations
    axm-manage-mcp-servers/SKILL.md    # Agent instructions for MCP server operations
    axm-manage-commands/SKILL.md       # Agent instructions for command operations
```

**Why source tree, not generated:** These are hand-authored agent instructions, not generated artifacts. Keeping them in source ensures they're version-controlled and reviewable.

### 2. Builtin-pack module exports identity and resolution

The `builtin-pack/` module is the single source of truth for the builtin pack's identity and resolution. It exports constants and a function to resolve the bundled manifest.

**Exports:**

```typescript
// builtin-pack/index.ts
export const BUILTIN_PACK_FQN = "@axm/cli"
export const BUILTIN_PACK_SCOPE = "@axm"
export const BUILTIN_PACK_NAME = "cli"

// Reads bundled axm-pack.json, returns manifest + CLI version
export const resolveBuiltinPack = () => Effect.gen(function* () { ... })
```

The module resolves the path to bundled assets relative to `import.meta.url`. Both init and update import from this module — the implicit dependency on `@axm/cli` is hardcoded here, not in workspace or settings.

**Why a dedicated module:** The knowledge of "what is the builtin pack" lives with the data it describes. Workspace and update are consumers, not owners.

### 3. `"builtin"` as a new source type in lockfile schema

`"builtin"` is a source type, just like `"registry"`, `"github"`, or `"local"`. Lock entries with `type: "builtin"` record extensions sourced from the CLI bundle.

**Pack lock entry (`BuiltinPackLockEntrySchema`):**

```yaml
"@axm/cli":
  type: builtin
  namespace: "@axm"
  name: cli
  resolvedVersion: "0.0.16"
  installedAt: "2026-02-14T..."
  updatedAt: "2026-02-14T..."
  resolvedSkills:
    "@axm/axm-manage-skills": "0.0.16"
    "@axm/axm-manage-packs": "0.0.16"
    "@axm/axm-manage-mcp-servers": "0.0.16"
    "@axm/axm-manage-commands": "0.0.16"
  resolvedCommands: {}
  resolvedMcpServers: {}
```

No `checksum` or `sourceName` fields — builtin assets are verified by the CLI build/distribution itself.

**Skill lock entry (`BuiltinSkillLockEntrySchema`):**

```yaml
axm-manage-skills:
  type: builtin
  agents: ["claude-code"]
  installedAt: "2026-02-14T..."
  updatedAt: "2026-02-14T..."
```

**Schema changes:**

- `PackLockEntrySchema` becomes a `Schema.Union` of `RegistryPackLockEntrySchema` and `BuiltinPackLockEntrySchema`
- `SkillLockEntrySchema` union gains `BuiltinSkillLockEntrySchema` as an additional variant

**Why a new source type, not reusing `"registry"`:** The source is fundamentally different — no registry to query, no checksum to verify, no source name to resolve. A distinct type lets code handle each source naturally via the discriminant without placeholder values.

### 4. Init materializes builtin pack (first-time only)

During `initializeProjectWorkspace()`, after writing settings with selected agents:

1. Call `resolveBuiltinPack()` to get the manifest and CLI version
2. Copy each skill directory to canonical location (`.axm/extensions/@axm/skills/<name>/`)
3. Create symlinks from each selected agent's skill directory to the canonical location
4. Write `type: "builtin"` pack and skill entries to lockfile with `resolvedVersion` = CLI version

If the builtin pack is already in the lockfile, init is a no-op for it. Version upgrades are handled by `axm update`, not init.

This reuses the existing `copySkillDirectory` and `createSymlink` utilities.

**Why at init, not lazily:** Skills must be present in agent directories immediately so agents can discover them.

### 5. Update handles builtin source like any other

`axm update` checks the builtin pack alongside registry/git/local sources. No skip logic, no special-casing — builtin participates in the normal update flow.

**Version comparison in `hasChanged()`:**

The existing function branches by source type (git → tree hash, registry → version, local → always). Add a `"builtin"` branch:

```typescript
if (entry.type === "builtin") {
  // Compare locked version against current CLI version
  return entry.resolvedVersion !== cliVersion;
}
```

**Discovery:** The update handler imports `resolveBuiltinPack()` to get the current manifest. It compares the manifest's skill list and CLI version against the locked pack entry. This handles:

- **Version bumps** — CLI version > locked version → re-materialize all skills, update lock entries
- **New skills added** — manifest has skills not in `resolvedSkills` → install them
- **Skills removed** — `resolvedSkills` has skills not in manifest → uninstall them

This is analogous to how registry pack updates work when a pack's skill set changes across versions.

## Risks / Trade-offs

**Lockfile schema change (new `"builtin"` source type)** → Forward-compatible. Older CLI versions that don't recognize `"builtin"` will fail to parse the lockfile, but this is acceptable given backward compatibility is a non-goal.

**Bundle size increase** → Negligible. SKILL.md files are small text files (a few KB each).

**No settings entry for builtin pack** → Commands like `axm packs list` that read from settings won't show the builtin pack unless they also consult the lockfile. Acceptable for now — the builtin pack is an implementation detail, not user-managed.
