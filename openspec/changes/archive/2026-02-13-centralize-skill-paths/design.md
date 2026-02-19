## Context

Skill handlers (install, enable, disable, uninstall, rename) each independently compute where a skill lives on disk. The logic branches on source type: registry skills go to `.axm/extensions/@<namespace>/skills/<name>/` with content in a `src/` subdirectory; all others go to `.agents/skills/<name>/`. This branching is duplicated across 5 handlers, and the rename handler got it wrong — it hardcodes the non-registry path, silently breaking registry-sourced renames.

Compounding the issue, scope representation is inconsistent. The parser strips the `@` from `@community/skill-name`, producing `namespace: "community"`. At least 3 downstream sites (install-skill, source service, settings schema) re-add the `@` before touching the filesystem or lockfile. The lock entry and filesystem always store `@community`, creating a mismatch with `SourceInput`.

## Goals / Non-Goals

**Goals:**

- `getSkillDir` method on the Workspace service — computes skill paths, called everywhere, duplicated nowhere
- Fix the rename bug for registry-sourced skills
- Align scope to `@`-prefixed everywhere — parser through lockfile through filesystem
- Rename `CANONICAL_SKILLS_DIR` to `UNIVERSAL_SKILLS_DIR` for clarity

**Non-Goals:**

- Changing the filesystem layout (`.agents/skills/` and `.axm/extensions/` stay as-is)
- Refactoring the sweep/cleanup helpers in uninstall/disable (they iterate all locations by design)
- Changing how `sanitizeName` works

## Decisions

### 1. `getSkillDir` lives on the Workspace service

```typescript
// On WorkspaceContextService:
readonly getSkillDir: (name: string, source?: SkillPathSource) => Effect.Effect<SkillDirPaths, CliError>;
```

The Workspace service already captures `path` (`@effect/platform Path.Path`) and knows `ws.path` (the `.axm` directory). This eliminates the `base` and `join` parameters — the service derives both internally.

**Two modes:**

- **Name-only** `getSkillDir(name)` — looks up the lock entry via `getLockedSkill(name)` to determine source type. Used by rename, enable, disable, uninstall — all of which already have a lock entry in the lockfile.
- **Explicit source** `getSkillDir(name, source)` — uses the provided source discriminant, skipping lockfile lookup. Used by install, where the lock entry doesn't exist yet.

The name is run through `sanitizeName` internally.

**Why on Workspace?** The service already owns lockfile access and workspace path resolution. Path computation is a natural extension. Callers don't need to manually derive `base`, `path.join`, or look up lock entries.

**Alternative considered:** Standalone pure function with `join`, `base`, `source` parameters. Rejected — pushes complexity to every call site and requires callers to derive `base` from `ws.path` and resolve the Path service themselves.

### 2. Minimal structural discriminant for the explicit-source mode

```typescript
export type SkillPathSource =
  | { readonly type: "registry"; readonly namespace: string }
  | { readonly type: Exclude<SourceType, "registry"> };
```

Both `SkillLockEntry` (when type is `"registry"`) and `RegistrySourceInput` structurally satisfy `{ type: "registry"; namespace: string }`. All non-registry variants satisfy the second branch. Callers pass what they already have — no adapter needed.

**Why `Exclude<SourceType, "registry">` over `string`?** Type-safe. If a new source type is added to `SourceType`, it automatically works. A bare `string` would accept invalid types silently.

### 3. Return `{ canonicalPath, skillSrcPath }` as a plain object

```typescript
export interface SkillDirPaths {
  readonly canonicalPath: string;
  readonly skillSrcPath: string;
}
```

- `canonicalPath`: root of the installed skill (contains manifest for registry, content for others)
- `skillSrcPath`: where actual skill source files live (agents symlink to this)

For non-registry: `canonicalPath === skillSrcPath`.
For registry: `skillSrcPath = canonicalPath + "/src"`.

### 4. Scope alignment: always `@`-prefixed from parse time

The parser currently strips `@` from `@community/skill-name` via regex group `([^/]+)`. Change to capture with prefix: the `RegistryPatternInput.scope` field becomes `"@community"` instead of `"community"`.

**What changes:**

- `parser.ts`: regex capture keeps `@` prefix
- `install-skill.ts`: remove 5-line scope normalization block
- `source service`: remove `startsWith("@")` check
- `registry provider`: remove defensive `@`-prefix comparison
- `printer.ts`: scope already has `@`, so `@community/skill-name` displays naturally
- `source-to-lock-entry.ts`: pass-through (no normalization needed)

**What doesn't change:**

- Lock entries already store `@`-prefixed scope — no migration needed
- Settings `ScopeSchema` already normalizes to `@` — becomes a no-op validation
- Filesystem layout unchanged

### 5. `CANONICAL_SKILLS_DIR` → `UNIVERSAL_SKILLS_DIR`

Rename in `constants.ts` and all consumers. The value `.agents/skills` stays the same. This constant is still needed for the sweep/cleanup helpers and self-reference detection — `getSkillDir` uses it internally.

## Risks / Trade-offs

**[Scope change breaks tests]** → No external consumers; internal to the CLI package. Tests that create `RegistrySourceInput` with bare scope need updating. `pnpm typecheck` catches all mismatches.

**[Workspace service grows]** → One method added. `getSkillDir` is a natural fit alongside `getLockedSkill`, `getConfiguredSkills`, etc. — it's path resolution for the same domain objects.

**[Sweep helpers don't use `getSkillDir`]** → Intentional. `uninstall` and `disable` iterate all scopes in `.axm/extensions/` — they don't target a specific scope. The constant rename (`UNIVERSAL_SKILLS_DIR`) is sufficient for these.
