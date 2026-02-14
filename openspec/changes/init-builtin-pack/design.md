## Context

After `axm init`, workspaces start empty — no skills, no guidance. The CLI already manages skills and packs via registry, git, and local sources, but users must know about these commands first. We want `axm init` to automatically provision a set of management skills that teach the agent how to use axm itself.

Today:

- Init creates settings.json + lockfile, detects agents, done.
- Packs are always registry-sourced (`PackLockEntry.type` is `Literal("registry")`).
- FQN schema (`/^@[\w-]+\/[\w-]+$/`) rejects dots in scopes, blocking `@axm.sh/*`.
- Skills are materialized as symlinks (or copies) from canonical paths into each agent's skill directory.

## Goals / Non-Goals

**Goals:**

- Ship management skill definitions (SKILL.md files) bundled with the CLI npm package
- Install `@axm.sh/cli` pack and its skills during `axm init` without registry connectivity
- Record the builtin pack and skills in lockfile (not settings) with a `"builtin"` source type
- Couple builtin skill lifecycle to CLI version — skills update when the CLI updates, not via registry
- Allow dots in FQN scope segments (`@axm.sh/...`)

**Non-Goals:**

- Bundling non-skill extension types (commands, MCP servers) in the initial builtin pack
- Managing builtin skills via registry — they are always tied to the installed CLI version
- Making the builtin pack removable or configurable — it's always present

## What Is NOT Changing

- **Settings schema** — No changes. The builtin pack is never written to settings.
- **Pack install flow** — No changes. Builtin pack is not installable via `axm packs install`.
- **Lockfile read/write logic** — Same read/write paths; the new `"builtin"` type is just another variant in the existing union schemas.

## What IS Changing

- **FQN validation** — Dots allowed in scope segment.
- **Lockfile schema** — New `"builtin"` variant in both `SkillLockEntrySchema` and `PackLockEntrySchema` unions.
- **Bundled assets** — New files shipped in the CLI npm package.
- **Init path** — After agent selection, materializes builtin skills and writes `"builtin"` lock entries.
- **Workspace service** — `getConfiguredPacks()` includes the builtin pack even though it has no settings entry.
- **Skills update flow** — Skips skills with `type: "builtin"` (they are managed by CLI lifecycle, not registry).

## Decisions

### 1. Bundled assets live in `packages/cli/src/builtin-pack/`

Source SKILL.md files and the pack manifest live in the source tree under `packages/cli/src/builtin-pack/`. The build copies them to `dist/src/builtin-pack/`, which is included in the npm package via the existing `"files": ["dist/src/"]` config.

**Structure:**

```
packages/cli/src/builtin-pack/
  axm-pack.json                        # Pack manifest for @axm.sh/cli
  skills/
    axm-manage-skills/SKILL.md         # Agent instructions for skill operations
    axm-manage-packs/SKILL.md          # Agent instructions for pack operations
    axm-manage-mcp-servers/SKILL.md    # Agent instructions for MCP server operations
    axm-manage-commands/SKILL.md       # Agent instructions for command operations
```

**Why source tree, not generated:** These are hand-authored agent instructions, not generated artifacts. Keeping them in source ensures they're version-controlled and reviewable.

**Alternative considered:** Embedding as string constants in TypeScript. Rejected — harder to review, edit, and test as standalone files.

### 2. New `"builtin"` lock entry type for both packs and skills

The builtin pack's lifecycle is coupled to the CLI version — there's no registry to fetch from, no checksum to verify, no source name to resolve. A distinct `"builtin"` type makes this explicit rather than overloading `"registry"` with placeholder values.

**Pack lock entry (`BuiltinPackLockEntrySchema`):**

```yaml
"@axm.sh/cli":
  type: builtin
  scope: "@axm.sh"
  name: cli
  resolvedVersion: "0.0.16" # CLI version that materialized the pack
  installedAt: "2026-02-14T..."
  updatedAt: "2026-02-14T..."
  resolvedSkills:
    "@axm.sh/axm-manage-skills": "0.0.16"
    "@axm.sh/axm-manage-packs": "0.0.16"
    "@axm.sh/axm-manage-mcp-servers": "0.0.16"
    "@axm.sh/axm-manage-commands": "0.0.16"
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

Minimal fields — just agents and timestamps. No source coordinates needed since the CLI binary is the source.

**Schema changes:**

- `PackLockEntrySchema` becomes a `Schema.Union` of `RegistryPackLockEntrySchema` and `BuiltinPackLockEntrySchema`
- `SkillLockEntrySchema` union gains `BuiltinSkillLockEntrySchema` as an additional variant

**Why a new type, not reusing `"registry"`:** The lifecycle is fundamentally different. Registry skills are fetched, checksummed, and updatable from a remote source. Builtin skills are bundled with the CLI binary and update when the CLI updates. Using `"registry"` with placeholder values (empty checksum, fake source name) would be misleading and require downstream code to special-case these "not really registry" entries. A clean type makes the distinction explicit and lets code handle each case naturally via the discriminant.

### 3. Init materializes builtin pack after agent selection

During `WorkspaceContext.make()` → `initializeProjectWorkspace()`, after writing settings with selected agents:

1. Resolve path to bundled assets relative to the CLI binary (using `import.meta.url` or `__dirname`)
2. Read `axm-pack.json` to discover skill references
3. Copy each skill directory to canonical location (`.axm/extensions/@axm.sh/skills/<name>/`)
4. Create symlinks from each selected agent's skill directory to the canonical location
5. Write `type: "builtin"` pack and skill entries to lockfile with `resolvedVersion` = CLI package version

This reuses the existing `copySkillDirectory` and `createSymlink` utilities.

**Why at init, not lazily:** Skills must be present in agent directories immediately so agents can discover them. Lazy loading would require a runtime check on every agent invocation.

### 4. Workspace service treats builtin pack as configured

`getConfiguredPacks()` returns the builtin pack (`@axm.sh/cli`) as a configured pack even though it has no settings entry. This ensures commands like `axm packs unpack` see the builtin pack.

Implementation: the method merges the implicit builtin pack entry with any explicit settings entries.

### 5. FQN pattern updated to allow dots in scope

Change `FullyQualifiedNameSchema` from `/^@[\w-]+\/[\w-]+$/` to `/^@[\w.-]+\/[\w-]+$/`.

Dots are only allowed in the **scope** segment (before `/`), not the name segment. This matches npm scoping conventions (`@angular.io/core` is valid npm).

**Impact:** All code that validates FQNs via this schema automatically accepts `@axm.sh/cli`, `@axm.sh/axm-manage-skills`, etc. No changes needed beyond the regex.

### 6. Skills update skips builtin skills

`axm skills update` SHALL skip skills with `type: "builtin"` in the lockfile. Builtin skills are coupled to the CLI version — they update when the CLI is upgraded, not via registry fetch.

This is a simple filter in the update handler: exclude lock entries where `type === "builtin"` from the update candidate list.

### 7. Builtin skills refresh on CLI upgrade

When `axm init` runs on an already-initialized workspace, if the locked builtin pack version differs from the current CLI version, the system re-materializes the bundled skills and updates the lock entries. This ensures builtin skills stay in sync with the CLI.

## Risks / Trade-offs

**FQN dot change is breaking** → Low risk. No existing extensions use dots in scopes. The change is additive (accepts strictly more inputs).

**Lockfile schema change (new `"builtin"` type)** → Forward-compatible. Older CLI versions that don't recognize `"builtin"` will fail to parse the lockfile, but this is acceptable given backward compatibility is a non-goal.

**Bundle size increase** → Negligible. SKILL.md files are small text files (a few KB each).
