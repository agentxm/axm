## Context

Today skills have a binary lifecycle — installed or not — expressed as a flat `name → source string` map in settings. The settings schema (`SkillsMapSchema`), workspace service (`setSkill`, `removeSkill`, `getInstalledSkills`), and all command handlers assume this flat string shape. Operations (`InstallSkillOperation`, `UninstallSkillOperation`) and their handlers (`installSkill`, `uninstallSkill`) drive the plan-based execution model. This change enriches the settings model and adds new operations for enable, disable, and rename.

## Goals / Non-Goals

**Goals:**

- Enriched `SkillEntry` schema that supports `enabled` and `managed` flags
- Enable/disable commands with agent file management
- Manual rename command and detected rename during update
- Update/uninstall respect `managed` and `enabled` flags
- Pack override entries (sourceless `{ "enabled": false }`)

**Non-Goals:**

- Access policy (allow/block lists) — separate concern, separate proposal
- Enriched entry types for commands, mcp-servers — same pattern applied later when those types are implemented
- Dependency resolution for packs — pack expansion is a separate capability
- Canonical storage for git-sourced skills — re-enable for git sources re-downloads (acceptable trade-off)

## Decisions

### 1. SkillEntry schema as a union type

`SkillsMapSchema` value changes from `Schema.String` to `Schema.Union(Schema.String, SkillEntryObjectSchema)`.

```typescript
const SkillEntryObjectSchema = Schema.Struct({
  source: Schema.optional(Schema.String),
  enabled: Schema.optional(Schema.Boolean),
  managed: Schema.optional(Schema.Boolean),
});

export const SkillEntrySchema = Schema.Union(Schema.String, SkillEntryObjectSchema);
```

**Why union over always-object:** Backwards compatibility with existing settings files. Most skills will remain plain strings — the object form only appears when a non-default flag is set. This also keeps settings.json clean and human-readable.

**Alternative: always normalize to objects on write.** Rejected — makes every settings file verbose and breaks the principle of least surprise for users who never use enable/disable.

### 2. Normalize on read, collapse on write

A `NormalizedSkillEntry` type represents the canonical internal form:

```typescript
interface NormalizedSkillEntry {
  readonly source: Option<string>;
  readonly enabled: boolean; // default: true
  readonly managed: boolean; // default: true
}
```

Two conversion functions at the settings boundary:

- `normalizeSkillEntry(entry: string | SkillEntryObject): NormalizedSkillEntry` — expands strings to `{ source: Some(s), enabled: true, managed: true }`.
- `collapseSkillEntry(entry: NormalizedSkillEntry): string | SkillEntryObject` — collapses back to string when `enabled: true`, `managed: true`, and `source` is `Some`. Otherwise writes the object form, omitting fields at defaults.

All handler code works with `NormalizedSkillEntry`. The workspace service handles conversion at its boundary.

**Why not normalize in each handler:** Centralized in the workspace service avoids repeated parsing and ensures consistent behavior.

### 3. Workspace service changes

**Modified methods:**

- `getInstalledSkills()` — return type changes from `SkillsMap` (string values) to `ReadonlyRecord<string, NormalizedSkillEntry>`. Callers get normalized entries.
- `setSkill(name, source, lockEntry)` — no signature change; it already accepts a source string. Internally collapses to string form since install always means `enabled: true, managed: true`.

**New methods:**

- `updateSkillEntry(name: string, updater: (entry: NormalizedSkillEntry) => NormalizedSkillEntry): Effect<void, CliError>` — reads the current entry, applies the updater, collapses, and writes back. Mutex-protected like `setSkill`. Used by enable/disable/rename.
- `renameSkill(oldName: string, newName: string): Effect<void, CliError>` — atomically renames the key in both settings and lockfile. Reads old entry + lock entry, writes new key, removes old key. Mutex-protected.

### 4. New operations and operation handlers

Three new operation types, following the existing `Operation<TName, TArgs>` pattern:

```typescript
export type EnableSkillOperation = Operation<
  "enable-skill",
  {
    readonly skillName: string;
    readonly agents: ReadonlyArray<string>;
    readonly lockEntry: SkillLockEntry;
  }
>;

export type DisableSkillOperation = Operation<
  "disable-skill",
  {
    readonly skillName: string;
    readonly agents: ReadonlyArray<string>;
  }
>;

export type RenameSkillOperation = Operation<
  "rename-skill",
  {
    readonly oldName: string;
    readonly newName: string;
    readonly agents: ReadonlyArray<string>;
    readonly lockEntry: SkillLockEntry;
  }
>;
```

**Operation handlers (new files):**

- `enableSkill(op: EnableSkillOperation)` — calls `ws.updateSkillEntry(name, e => { ...e, enabled: true })`, then installs agent files (symlink or copy, same as installSkill's agent-install phase). The lockEntry carries source type to determine whether to symlink from canonical (registry/local) or re-download (git).
- `disableSkill(op: DisableSkillOperation)` — calls `ws.updateSkillEntry(name, e => { ...e, enabled: false })`, then removes agent skill directories (same removal logic as uninstallSkill's agent-removal phase).
- `renameSkill(op: RenameSkillOperation)` — calls `ws.renameSkill(oldName, newName)`, then removes old agent directories and installs new ones under the new name.

**Why use the plan system for enable/disable/rename:** Consistency with install/update/uninstall. Users get `--preview`, `--yes`, confirmation prompts, and result display through the same `ws.resolvePlan()` flow. The plan may be trivially simple (one step), but the UX is uniform.

**Alternative: direct mutation without plans.** Rejected — inconsistent UX. Users expect `--preview` and `--yes` to work the same way across all commands.

### 5. New command handlers

Three new command directories under `packages/cli/src/cli-commands/skills/`:

**`skills/enable/`**

- `command.ts` — `axm skills enable <name>` with `--yes`, `--preview`, `--global`, `--non-interactive` flags
- `handler.ts` — `handleEnable(args: EnableHandlerArgs)`:
  1. Load installed skills and locked skills from workspace
  2. Validate skill exists and is currently disabled (error if not found, no-op if already enabled)
  3. Build `EnableSkillOperation` with agents from lockfile entry
  4. Build single-step plan
  5. Resolve plan via `ws.resolvePlan()`

**`skills/disable/`**

- `command.ts` — `axm skills disable <name>` with same standard flags
- `handler.ts` — `handleDisable(args: DisableHandlerArgs)`:
  1. Load installed skills from workspace
  2. Validate skill exists and is currently enabled (error if not found, no-op if already disabled)
  3. Build `DisableSkillOperation` with agents from lockfile
  4. Build single-step plan
  5. Resolve plan via `ws.resolvePlan()`

**`skills/rename/`**

- `command.ts` — `axm skills rename <old-name> <new-name>` with standard flags
- `handler.ts` — `handleRename(args: RenameHandlerArgs)`:
  1. Load installed skills and locked skills
  2. Validate old name exists, new name doesn't conflict
  3. Build `RenameSkillOperation`
  4. Build single-step plan
  5. Resolve plan via `ws.resolvePlan()`

### 6. Modified command handlers

**`skills/update/handler.ts`** — two changes:

1. **Skip conditions.** After loading installed skills, filter out entries where `enabled: false` or `managed: false`. Log a skip message for each (e.g., "Skipping my-skill (disabled)" or "Skipping my-skill (unmanaged)").

2. **Rename detection.** After re-resolving a source, if the expected skill name is not found in the discovered skills:
   - Count how many skills the source provides.
   - **Single-skill source:** The one discovered skill is treated as a rename. Add a `RenameSkillOperation` to the plan instead of an `InstallSkillOperation`. The plan display shows `old-name → new-name`.
   - **Multi-skill source:** Log a warning: "Skill 'X' not found in source Y. Available skills: A, B, C. Use `axm skills rename X <new-name>` to update." Skip this skill in the plan.
   - **Resolution failure:** Existing error handling applies (log warning, continue with other skills).

**`skills/update/build-plan.ts`** — accept `RenameSkillOperation` alongside `InstallSkillOperation` in the plan. The step type is a union: `InstallSkillOperation | RenameSkillOperation`. Rename steps always have `expectedResult: { result: "success" }`.

**`skills/uninstall/handler.ts`** — after loading installed skills, check the `managed` flag. If `managed: false` and `--force` is not set, log a warning and skip: "Skill 'X' is not managed by axm. Use --force to uninstall anyway."

**`skills/install/handler.ts`** — when writing the skill entry via `ws.setSkill()`, the workspace service handles normalization. No handler change needed since install always writes `enabled: true, managed: true` (the default, collapsed to a string).

### 7. Skills command registration

`packages/cli/src/cli-commands/skills/command.ts` — register three new subcommands:

```typescript
.command(enableCommand)
.command(disableCommand)
.command(renameCommand)
```

### 8. Operation type union for update plans

The update plan currently uses `Plan<InstallSkillOperation>`. With rename detection, it becomes `Plan<InstallSkillOperation | RenameSkillOperation>`. The operation handler registry expands:

```typescript
ws.resolvePlan(plan, {
  "install-skill": installSkill,
  "rename-skill": renameSkill,
});
```

This is type-safe via the existing `Handlers<Op>` exhaustive mapping type.

## Risks / Trade-offs

**Re-enable for git sources requires re-download** → Acceptable. The primary value of disable is preserving the settings entry (source, flags). Registry and local sources re-enable instantly. If git source re-download becomes a pain point, a future change can add canonical storage for git sources.

**Plan system for single-operation commands (enable/disable) adds ceremony** → The plan is trivially simple (one step) but gives users consistent `--preview`/`--yes` behavior. The alternative (direct mutation) would save a few lines but break UX consistency.

**Rename detection for multi-skill sources is limited to reporting** → No automatic inference. False positives (guessing wrong rename) would be worse than asking the user to run `axm skills rename`. Single-skill sources get automatic detection since the mapping is unambiguous.

**SkillsMap type change ripples through callers** → `getInstalledSkills()` return type changes from `Record<string, string>` to `Record<string, NormalizedSkillEntry>`. All callers (install, update, uninstall, list, fork) need to extract `.source` where they previously used the string directly. This is mechanical but touches multiple files.

## Open Questions

- Should `axm skills list` show a visual indicator for disabled/unmanaged skills? Likely yes (e.g., `(disabled)`, `(unmanaged)`) but the exact format can be decided during implementation.
- Should `axm skills enable` on a git-sourced skill that requires re-download show a different message than one that symlinks instantly? Could be helpful UX but adds complexity.
