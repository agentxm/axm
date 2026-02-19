## Context

Extensions (skills, commands, mcp-servers) are managed individually today. There's no mechanism to bundle, distribute, or install a curated set of extensions as a single unit. The workspace plan system, registry layout, and managed extension infrastructure already exist and are extension-type-agnostic, making packs a natural extension of existing patterns.

Packs are metadata-only bundles — they reference other extensions but contain no code themselves. This distinguishes them from skills and mcp-servers which have `src/` directories with actual content.

## Goals / Non-Goals

**Goals:**

- Define pack manifest schema and directory structure
- Support full pack lifecycle: create, install, uninstall, publish, unpack
- Support modifying pack contents: add/remove extensions
- Integrate packs into the existing workspace plan system
- Narrowly type pack entries in settings schema (not generic `ExtensionMap`)
- Cascade install/uninstall to pack-referenced extensions

**Non-Goals:**

- Enable/disable for packs (deferred)
- Nested packs (packs referencing other packs) — keep it flat for now
- Non-registry sources (GitHub, git, local) for packs
- Version conflict resolution across multiple packs (first installed wins)
- Backward compatibility with current `ExtensionMap` typing for packs

## Decisions

### 1. Pack manifest uses version-specifier maps, not settings-style entries

**Decision:** Pack manifest entries are `{ "@scope/name": "<version-range>" }` maps for each extension type — not the richer `SkillEntry` union used in settings.json.

**Rationale:** All extensions in a pack are registry-sourced by definition. There's no need for unmanaged markers, enabled flags, or source strings. Version specifiers are the only meaningful information. This keeps the manifest simple and declarative.

**Alternative considered:** Mirror settings.json entry types exactly. Rejected because settings entries carry workspace-specific state (enabled, unmanaged) that doesn't belong in a distributable pack.

```json
{
  "name": "@acme/frontend-pack",
  "version": "1.0.0",
  "description": "Standard frontend agent tooling",
  "skills": {
    "@acme/code-review": "^1.0.0",
    "@acme/linting": "^2.0.0"
  },
  "commands": {
    "@acme/formatter": "^1.0.0"
  },
  "mcp-servers": {
    "@acme/db-browser": "^3.0.0"
  }
}
```

### 2. PacksMap uses narrow typing with pack-specific entry schema

**Decision:** Define a `PackEntrySchema` union and `PacksMapSchema` parallel to `SkillEntrySchema`/`SkillsMapSchema`. Initial entry types:

- **Plain string** — source string (e.g., `"@acme/frontend-pack"`)
- **Pack entry object** — `{ source: string }` for explicit managed form

No unmanaged marker (packs are always managed). No enabled flag (enable/disable deferred).

**Rationale:** Narrow typing catches invalid entries at parse time and provides a clear extension point for future pack-specific fields without changing the schema shape. Using `ExtensionMap` (plain string → string) is too loose.

**Alternative considered:** Keep `ExtensionMap` until more pack-specific fields emerge. Rejected because the user explicitly wants narrow typing from the start, and retrofitting is harder than starting typed.

### 3. Packs are metadata-only — no `src/` subdirectory

**Decision:** Pack directory structure is:

```
.axm/extensions/@<namespace>/packs/<name>/
  axm-pack.json       # Pack manifest (only file)
```

No `src/` subdirectory. No agent symlinks. Pack archives (`.zip`) include `axm-pack.json` and any accompanying files (e.g., `README.md`) at the root.

**Rationale:** Packs are bundles of references, not executable code. They don't need source files and don't get symlinked to agents. However, authors may include documentation or other supplementary files alongside the manifest — these should be preserved through the publish/install cycle.

**Alternative considered:** Use `src/` with a manifest inside (matching skill structure). Rejected because it adds unnecessary nesting and the `src/` convention exists for agent-visible content that gets symlinked.

### 4. Install cascades to referenced extensions

**Decision:** `axm packs install` builds a plan that includes:

1. An `install-pack` operation for the pack itself
2. `install-skill`, `install-command`, `install-mcp-server` operations for each referenced extension not already installed

All operations go into a single plan. The pack operation runs first (to write settings + lockfile entry), then referenced extensions install concurrently.

**Rationale:** A pack is only useful when its contents are installed. Requiring separate manual installation defeats the purpose. The plan system already supports multi-step jobs, so this fits naturally.

**Alternative considered:** Install pack metadata only, require separate `axm skills install` for contents. Rejected — packs exist specifically to avoid this.

### 5. Uninstall removes the pack and orphaned extensions

**Decision:** `axm packs uninstall` builds a plan that:

1. Removes the pack entry from settings and lockfile
2. Identifies extensions that were brought in by this pack and are not:
   - Directly listed in settings.json (independent of any pack)
   - Referenced by another installed pack
3. Includes `uninstall-*` operations for orphaned extensions

The orphan check prevents removing extensions that the user or another pack still needs.

**Rationale:** Clean uninstall means removing what was brought in. Without orphan cleanup, packs would leak extensions. The orphan check prevents breaking other packs or explicit user configuration.

### 6. Unpack flattens pack contents into settings

**Decision:** `axm packs unpack` takes a pack name and:

1. Reads the pack's manifest to get referenced extensions
2. For each extension: adds it directly to the appropriate settings section (skills, commands, mcp-servers) if not already present
3. Removes the pack entry from settings
4. Leaves the referenced extensions installed (they're already on disk from the pack install)

This is a settings-level operation — it doesn't re-download or re-install anything. Extensions that were installed via the pack remain installed; they just become direct entries.

**Rationale:** Unpack is an "eject" operation. Users get the pack's contents as first-class settings entries they can individually manage, update, or remove.

### 7. Registry layout adds `packs/` directory segment

**Decision:** Extend `RegistryExtensionTypeSchema` to include `"pack"`. Registry structure:

```
<registry-root>/extensions/@<namespace>/packs/<name>/
  index.json
  1.0.0.zip
```

Pack archives contain `axm-pack.json` at root (no `src/` directory).

Pack `index.json` uses the same `ExtensionIndex` schema with `type: "pack"`.

**Rationale:** Consistent with existing extension type directory segments (`skills/`, `mcp-servers/`). The index schema is generic enough to support packs without modification.

### 8. Pack lockfile: separate `packs` section with typed resolved fields

**Decision:** Packs get their own top-level section in the lockfile (not mixed with skills). Pack lock entries use flat `resolvedSkills`, `resolvedCommands`, `resolvedMcpServers` fields mapping FQN to exact resolved version:

```json
{
  "packs": {
    "@acme/frontend-pack": {
      "type": "registry",
      "namespace": "@acme",
      "name": "frontend-pack",
      "resolvedVersion": "1.0.0",
      "checksum": "sha256:...",
      "sourceName": "default",
      "installedAt": "...",
      "updatedAt": "...",
      "resolvedSkills": {
        "@acme/code-review": "1.2.0",
        "@acme/linting": "2.1.0"
      },
      "resolvedCommands": {
        "@acme/formatter": "1.0.0"
      },
      "resolvedMcpServers": {}
    }
  }
}
```

Orphan detection during uninstall: scan all _other_ pack lock entries' `resolved*` fields and check settings.json for direct entries. This is cheap since the `packs` section is small and local — no external I/O needed.

**Rationale:** A separate `packs` section mirrors settings.json structure and avoids type discrimination issues. Flat `resolved*` fields are explicit per extension type and easy to extend. No `installedBy` tracking on extension entries — the cross-pack scan is sufficient and avoids write overhead on every pack install/uninstall.

### 9. Add/remove modify the local pack manifest

**Decision:** `axm packs add` and `axm packs remove` operate on the local `axm-pack.json` manifest:

- `add` accepts an explicit extension name or a glob pattern (e.g., `"effect-*"`). Globs are expanded against managed, registry-sourced extensions currently installed in the workspace. Each matched extension is added to the appropriate manifest section with a version range derived from its installed version.
- `remove` removes the extension from the manifest

These are manifest edits only — they don't install/uninstall anything from the workspace. To sync the workspace after modifying a pack, use `axm packs install` (which reconciles against the current manifest).

**Rationale:** Separating pack authoring (add/remove) from workspace mutation (install/uninstall) keeps operations predictable. Glob support makes it easy to compose packs from existing workspace extensions (e.g., `axm packs add my-pack "effect-*"` adds all `effect-`-prefixed extensions in one command). Only managed, registry-sourced extensions are eligible — non-registry extensions can't be pack contents.

### 10. Publish reuses existing publish flow

**Decision:** `axm packs publish` follows the same flow as skill publishing:

1. Validate `axm-pack.json` exists in the pack directory
2. Create zip archive containing `axm-pack.json` at root
3. Compute SHA-256 checksum
4. Write archive to registry under `packs/` segment
5. Update `index.json`

The archive zips all files in the pack directory (manifest + any accompanying files like README.md) at root. The publish pipeline is identical to skills.

**Rationale:** The publish infrastructure is already extension-type-agnostic. Packs are just another type. Zipping the entire directory (rather than just the manifest) preserves any supplementary files authors include.

### 11. Transitive skill visibility and direct entry promotion

**Decision:** Expand `getInstalledSkills()` to return both direct (settings.json) and transitive (pack-provided) skills, merged with direct entries taking precedence. `getConfiguredSkills()` remains unchanged — it returns only settings.json entries.

- **`getConfiguredSkills()`** — skills explicitly in settings.json (already exists, no change)
- **`getInstalledSkills()`** — configured skills + transitive pack dependencies (expanded). Transitive skills are derived from installed packs' `resolvedSkills` in the lockfile. Direct entries always win over transitive.

**Disable flow for pack-provided skills:**

When a user disables a skill that only exists transitively (via a pack), a direct settings entry is created:

1. `axm skills disable @myorg/someskill`
2. `getInstalledSkills()` finds it (transitive via pack)
3. No direct settings entry exists → create `"someskill": { "source": "@myorg/someskill", "enabled": false }`
4. The direct entry now overrides the pack's transitive inclusion

**Impact on pack uninstall orphan detection:**

A skill that was promoted to direct (e.g., via disable) is NOT orphaned when its pack is uninstalled — the user has explicitly interacted with it. Only skills with no direct settings entry and no other pack reference are orphaned.

**Impact on unpack:**

`packs unpack` preserves existing direct entries. If a skill was disabled by the user, unpack won't overwrite the `enabled: false` entry.

**Rationale:** `getConfiguredSkills` already returns settings.json entries — it naturally serves as the "direct" query. Expanding `getInstalledSkills` to include transitive dependencies gives commands like `disable`, `enable`, and `list` full visibility without needing to know about packs. The promotion pattern (transitive → direct on user interaction) keeps settings.json as the single source of truth for user intent.

### 12. CLI command spec

**Decision:** Create a `packs` command group following the same yargs pattern as skills. Each subcommand follows the `command.ts` + `handler.ts` pattern. Handlers use Effect and the workspace plan system.

All mutation commands support `--yes`/`-y`, `--non-interactive`. Plan-based commands also support `--preview`. Packs always install to all configured workspace agents — no `--agent` flag.

#### `axm packs new <name>`

Scaffold a new empty pack with manifest.

| Arg/Flag            | Type       | Required | Description                              |
| ------------------- | ---------- | -------- | ---------------------------------------- |
| `name`              | positional | yes      | Pack name (scoped using workspace scope) |
| `--namespace`       | string     | no       | Override workspace scope                 |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts                |
| `--non-interactive` | boolean    | no       | Disable all prompts                      |

```bash
axm packs new frontend-tools                # Create @<namespace>/frontend-tools
axm packs new frontend-tools --namespace @co    # Create @co/frontend-tools
```

#### `axm packs install <source>`

Install a pack from a registry and all its referenced extensions.

| Arg/Flag            | Type       | Required | Description                                                      |
| ------------------- | ---------- | -------- | ---------------------------------------------------------------- |
| `source`            | positional | yes      | Pack source (`@scope/name`, `@scope/name@version`, or bare name) |
| `--global`          | boolean    | no       | Install to global `~/.axm/`                                      |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts                                        |
| `--force`, `-f`     | boolean    | no       | Overwrite existing extensions                                    |
| `--preview`         | boolean    | no       | Display plan without applying                                    |
| `--non-interactive` | boolean    | no       | Disable all prompts                                              |

```bash
axm packs install @acme/frontend-tools            # Install pack + all contents
axm packs install @acme/frontend-tools@^2.0.0     # Install specific version range
axm packs install frontend-tools                   # Use scope from settings
axm packs install @acme/frontend-tools --preview   # See what would be installed
```

#### `axm packs uninstall <name>`

Uninstall a pack and remove orphaned extensions.

| Arg/Flag            | Type       | Required | Description                        |
| ------------------- | ---------- | -------- | ---------------------------------- |
| `name`              | positional | yes      | Pack name (supports glob patterns) |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts          |
| `--preview`         | boolean    | no       | Display plan without applying      |
| `--non-interactive` | boolean    | no       | Disable all prompts                |

```bash
axm packs uninstall @acme/frontend-tools             # Uninstall pack + orphaned deps
axm packs uninstall "@acme/*"                         # Uninstall all packs matching glob
axm packs uninstall @acme/frontend-tools --preview    # See what would be removed
```

#### `axm packs add <pack> <extension>`

Add a managed, registry-sourced extension to a pack's manifest. Supports glob patterns matched against installed workspace extensions. Extension type is inferred from the lockfile/settings — no `--type` flag needed.

| Arg/Flag            | Type       | Required | Description                                                              |
| ------------------- | ---------- | -------- | ------------------------------------------------------------------------ |
| `pack`              | positional | yes      | Pack name to modify                                                      |
| `extension`         | positional | yes      | Extension name or glob pattern (e.g., `@acme/code-review`, `"effect-*"`) |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts                                                |
| `--non-interactive` | boolean    | no       | Disable all prompts                                                      |

```bash
axm packs add frontend-tools @acme/code-review   # Add a specific extension
axm packs add frontend-tools "effect-*"           # Add all effect-* extensions from workspace
```

#### `axm packs remove <pack> <extension>`

Remove an extension from a pack's manifest.

| Arg/Flag            | Type       | Required | Description                    |
| ------------------- | ---------- | -------- | ------------------------------ |
| `pack`              | positional | yes      | Pack name to modify            |
| `extension`         | positional | yes      | Extension name or glob pattern |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts      |
| `--non-interactive` | boolean    | no       | Disable all prompts            |

```bash
axm packs remove frontend-tools @acme/code-review  # Remove specific extension
axm packs remove frontend-tools "lint-*"            # Remove all matching extensions
```

#### `axm packs publish <pack>`

Publish a pack to a registry.

| Arg/Flag            | Type       | Required | Description                            |
| ------------------- | ---------- | -------- | -------------------------------------- |
| `pack`              | positional | yes      | Pack name (`@scope/name` or bare name) |
| `--registry`        | string     | no       | Named registry source to publish to    |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts              |
| `--preview`         | boolean    | no       | Display plan without applying          |
| `--non-interactive` | boolean    | no       | Disable all prompts                    |

```bash
axm packs publish @acme/frontend-tools                 # Publish to default registry
axm packs publish frontend-tools --registry local       # Publish to named registry
```

#### `axm packs unpack <name>`

Flatten a pack's extensions into workspace settings as individual entries, then remove the pack entry.

| Arg/Flag            | Type       | Required | Description                   |
| ------------------- | ---------- | -------- | ----------------------------- |
| `name`              | positional | yes      | Pack name to unpack           |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts     |
| `--preview`         | boolean    | no       | Display plan without applying |
| `--non-interactive` | boolean    | no       | Disable all prompts           |

```bash
axm packs unpack @acme/frontend-tools              # Eject pack contents into settings
axm packs unpack @acme/frontend-tools --preview     # See what would change in settings
```

## Risks / Trade-offs

**[Orphan detection complexity]** → Determining whether an extension is orphaned requires scanning all pack manifests and settings entries. Mitigated by the `resolvedExtensions` field in pack lock entries, making it a lockfile lookup rather than manifest parsing.

**[No nested packs]** → Flat-only design limits composability. Mitigated by keeping the manifest schema extensible (could add `packs` field later). Flat packs cover the common use case without dependency resolution complexity.

**[No version conflict resolution]** → If two packs reference the same extension at different versions, the first-installed version wins. Mitigated by the plan system showing expected results (no-op for already installed). Users see what was skipped and can manage conflicts manually.

**[Lightweight archives]** → Pack archives are small (manifest + optional docs). This is unusual but correct — packs are primarily pointers, not content. Could confuse users expecting substantial archives.
