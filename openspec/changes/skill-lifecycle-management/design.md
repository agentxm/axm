## Context

Today skills have a binary lifecycle — installed or not — expressed as a flat `name → source string` map in settings. The settings schema (`SkillsMapSchema`), workspace service (`setSkill`, `removeSkill`, `getInstalledSkills`), and all command handlers assume this flat string shape. Operations (`InstallSkillOperation`, `UninstallSkillOperation`) and their handlers (`installSkill`, `uninstallSkill`) drive the plan-based execution model. This change enriches the settings model and adds new operations for enable, disable, and rename.

## Goals / Non-Goals

**Goals:**

- Enriched `SkillEntry` schema: `SkillEntryObjectSchema` (managed, with source and config) and `UnmanagedSkillEntrySchema` (just a marker)
- Enable/disable commands with agent file management
- Manual rename command and detected rename during update
- Update/uninstall respect `managed` and `enabled` flags
- Unmanaged skill entries (`{ managed: false }`) for skills not managed by axm

**Non-Goals:**

- Access policy (allow/block lists) — separate concern, separate proposal
- Enriched entry types for commands, mcp-servers — same pattern applied later when those types are implemented
- Dependency resolution for packs — pack expansion is a separate capability
- Disabled skill staging area — re-enable re-installs from source for all source types (acceptable trade-off)
- Registry scope change detection — rename detection handles name changes within a source, not scope migrations

## Decisions

### 1. SkillEntry schema as a union type

`SkillsMapSchema` value changes from `Schema.String` to `SkillEntrySchema`:

```typescript
export const SkillsMapSchema = Schema.Record({
  key: Schema.String,
  value: SkillEntrySchema,
}).pipe(Schema.filter(validateSkillNameKeys));
```

Two distinct object schemas reflect two structurally different cases:

```typescript
// Managed skill with source and optional config flags.
// `managed` never appears here — being in this form means managed.
const SkillEntryObjectSchema = Schema.Struct({
  source: Schema.String,
  enabled: Schema.optional(Schema.Boolean),
});

// Unmanaged skill — just a marker. No source or config needed
// because axm doesn't manage it.
const UnmanagedSkillEntrySchema = Schema.Struct({
  managed: Schema.Literal(false),
});

export const SkillEntrySchema = Schema.Union(
  Schema.String,
  SkillEntryObjectSchema,
  UnmanagedSkillEntrySchema,
);
```

**Why two object schemas over one with all-optional fields:** Managed and unmanaged entries are structurally different. Managed entries always have a source and may carry config (enabled, future fields); unmanaged entries are just a flag — source and config are irrelevant since axm doesn't manage them. A single struct with all-optional fields allows nonsense combinations like `{ managed: false, enabled: false, source: "..." }`.

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

- `normalizeSkillEntry(entry: string | SkillEntryObject | UnmanagedSkillEntry): NormalizedSkillEntry` — expands strings to `{ source: Some(s), enabled: true, managed: true }`, object entries to `{ source: Some(s), enabled, managed: true }`, unmanaged entries to `{ source: None, enabled: true, managed: false }`.
- `collapseSkillEntry(entry: NormalizedSkillEntry): string | SkillEntryObject | UnmanagedSkillEntry` — `managed: false` is dominant: always collapses to `{ managed: false }` regardless of `enabled` (axm can't disable what it doesn't manage, so `enabled` is meaningless for unmanaged entries). For managed entries: collapses to string when `enabled: true` and `source` is `Some`; otherwise writes `SkillEntryObject` form, omitting fields at defaults.

All handler code works with `NormalizedSkillEntry`. The workspace service handles conversion at its boundary.

**Why not normalize in each handler:** Centralized in the workspace service avoids repeated parsing and ensures consistent behavior.

### 3. Workspace service changes

**Modified methods:**

- `getInstalledSkills()` — return type changes from `SkillsMap` (string values) to `ReadonlyRecord<string, NormalizedSkillEntry>`. Returns only managed entries (`managed: true`). Settings is the source of truth for user intent/desired state — the lockfile is derived and re-creatable. Callers can rely on `source` being `Some` for all returned entries.
- `setSkill(name, source, lockEntry)` — no signature change; it already accepts a source string. Internally collapses to string form since install always means `enabled: true, managed: true`.

**New methods:**

- `getConfiguredSkills(): Effect<ReadonlyRecord<string, NormalizedSkillEntry>, CliError>` — returns all skill entries from settings (managed and unmanaged), normalized. This is the complete view of user-declared desired state. Callers filter by `managed`, `enabled`, etc. as needed. A future `getActualSkills()` will inspect disk state for comparison.
- `updateSkillEntry(name: string, updater: (entry: NormalizedSkillEntry) => NormalizedSkillEntry): Effect<void, CliError>` — reads the current entry, applies the updater, collapses, and writes back. Fails with `CliError` if the skill doesn't exist in settings. Mutex-protected like `setSkill`. Used by enable/disable.
- `updateLockEntryAgents(name: string, agents: ReadonlyArray<string>): Effect<void, CliError>` — updates the `agents` field on the lock entry for the given skill. Fails with `CliError` if the lock entry doesn't exist. Mutex-protected. Used by enable/disable to keep lock entry agents in sync with actual symlink state.
- `renameSkill(oldName: string, newName: string): Effect<void, CliError>` — atomically renames the key in both settings and lockfile. Reads old entry + lock entry, writes new key, removes old key. Mutex-protected.

### 4. New operations and operation handlers

Three new operation types, following the existing `Operation<TName, TArgs>` pattern:

```typescript
export type EnableSkillOperation = Operation<"enable-skill", { readonly skillName: string }>;

export type DisableSkillOperation = Operation<"disable-skill", { readonly skillName: string }>;

export type RenameSkillOperation = Operation<
  "rename-skill",
  { readonly oldName: string; readonly newName: string }
>;
```

Operations carry only names — no `agents` or `lockEntry`. Handlers read all runtime state from the workspace at execution time: configured agents via `ws.getConfiguredAgents()`, lock entries via `ws.getLockedSkill()`. This avoids stale snapshots, keeps operations minimal, and ensures enable/disable/rename always target the current set of configured agents (not the agents list from the original install).

**Operation handlers (new files):**

- `enableSkill(op: EnableSkillOperation)` — reads configured agents, lock entry, and settings entry (for source string) from workspace. Re-installs skill files first: the lock entry's `type` field determines the canonical path (`registry` → `.axm/extensions/@<scope>/skills/<name>/`, others → `.agents/skills/<name>/`), re-resolves the source string via `SourceProviders`, fetches/copies to canonical, and creates agent symlinks via `installForAgent` (which handles the `contentPath` distinction: registry symlinks target `canonicalPath/src`, others target `canonicalPath`). For git sources, re-downloads since canonical files were removed during disable. Updates state last: calls `ws.updateLockEntryAgents(name, configuredAgents)` to sync the lock entry with the agents that now have symlinks, then `ws.updateSkillEntry(name, e => { ...e, enabled: true })`. This matches `installSkill`'s convention (files first, settings last) — if re-install fails, the skill remains `enabled: false`, which is the correct recovery state.
- `disableSkill(op: DisableSkillOperation)` — reads configured agents and lock entry from workspace. Removes files first: removes both agent symlinks and canonical skill directories. Agent symlink removal uses the same logic as uninstallSkill's agent-removal phase. Canonical removal is required because agents whose `skills.dir` resolves to the canonical location (e.g., `.agents/skills/`) read directly from canonical with no symlink — removing only symlinks would leave the skill visible to those agents. The lock entry's source type determines the canonical path: registry sources use `.axm/extensions/@<scope>/skills/<name>/`, others use `.agents/skills/<name>/`. Updates state last: calls `ws.updateLockEntryAgents(name, [])` to clear the lock entry's agents (no symlinks exist), then `ws.updateSkillEntry(name, e => { ...e, enabled: false })` only after file removal succeeds.
- `renameSkill(op: RenameSkillOperation)` — reads configured agents, lock entry, and settings entry from workspace first (all read by old name). File operations first: renames the canonical directory from old name to new name (same canonical path logic: registry → `.axm/extensions/@<scope>/skills/`, others → `.agents/skills/`), removes old agent symlinks, and creates new ones under the new name using `installForAgent`. Settings/lockfile last: calls `ws.renameSkill(oldName, newName)`, then `ws.updateLockEntryAgents(newName, configuredAgents)` to sync the lock entry with the agents that now have symlinks. This matches the files-first convention — if file rename fails, settings still point to the old name, which is the correct recovery state.

**Why use the plan system for enable/disable/rename:** Consistency with install/update/uninstall. Users get `--preview`, `--yes`, confirmation prompts, and result display through the same `ws.resolvePlan()` flow. The plan may be trivially simple (one step), but the UX is uniform.

**Alternative: direct mutation without plans.** Rejected — inconsistent UX. Users expect `--preview` and `--yes` to work the same way across all commands.

### 5. New command handlers

Three new command directories under `packages/cli/src/cli-commands/skills/`:

**`skills/enable/`**

- `command.ts` — `axm skills enable <name>` with `--yes`, `--preview`, `--global`, `--non-interactive` flags
- `handler.ts` — `handleEnable(args: EnableHandlerArgs)`:
  1. Load configured skills from workspace (`getConfiguredSkills`)
  2. Validate skill exists, is managed, and is currently disabled. Error if not found, error if unmanaged (clear message: "cannot enable unmanaged skill"), no-op if already enabled.
  3. Build `EnableSkillOperation` with skill name
  4. Build single-step plan
  5. Resolve plan via `ws.resolvePlan()`

**`skills/disable/`**

- `command.ts` — `axm skills disable <name>` with same standard flags
- `handler.ts` — `handleDisable(args: DisableHandlerArgs)`:
  1. Load configured skills from workspace (`getConfiguredSkills`)
  2. Validate skill exists, is managed, and is currently enabled. Error if not found, error if unmanaged (clear message: "cannot disable unmanaged skill"), no-op if already disabled.
  3. Build `DisableSkillOperation`
  4. Build single-step plan
  5. Resolve plan via `ws.resolvePlan()`

**`skills/rename/`**

- `command.ts` — `axm skills rename <old-name> <new-name>` with standard flags
- `handler.ts` — `handleRename(args: RenameHandlerArgs)`:
  1. Load configured skills and locked skills (`getConfiguredSkills`, `getLockedSkills`)
  2. Validate old name exists, is managed, and new name doesn't conflict. Error if not found, error if unmanaged.
  3. Build `RenameSkillOperation`
  4. Build single-step plan
  5. Resolve plan via `ws.resolvePlan()`

### 6. Modified command handlers

**`skills/update/handler.ts`** — two changes:

1. **Skip conditions and type change.** After loading configured skills via `getConfiguredSkills()` (now `ReadonlyRecord<string, NormalizedSkillEntry>`), filter to entries where `managed: true` and `enabled: true`. Log a skip message for filtered entries (e.g., "Skipping my-skill (disabled)" or "Skipping my-skill (unmanaged)"). Remaining entries extract the source string via `Option.getOrThrow(entry.source)` — safe because only managed entries remain where `source` is always `Some`.

2. **Rename detection.** After re-resolving a source, if the expected skill name is not found in the discovered skills:
   - Count how many skills the source provides.
   - **Single-skill source:** The one discovered skill is treated as a rename. Add two operations to the plan: an `InstallSkillOperation` for the new name (fresh content, full install) followed by an `UninstallSkillOperation` for the old name (removes old settings/lock entry and files). The plan display shows `old-name → new-name (install + cleanup)`. This is simpler than a dedicated rename — install handles content fetching, and uninstall handles cleanup. The new name gets a fresh lock entry with current metadata.
   - **Multi-skill source:** Log a warning: "Skill 'X' not found in source Y. Available skills: A, B, C. Use `axm skills rename X <new-name>` to update." Skip this skill in the plan.
   - **Resolution failure:** Existing error handling applies (log warning, continue with other skills).

**`skills/update/build-plan.ts`** — accept `UninstallSkillOperation` alongside `InstallSkillOperation` in the plan for rename-detection cleanup. The step type is a union: `InstallSkillOperation | UninstallSkillOperation`.

**`skills/uninstall/handler.ts`** — after loading configured skills via `getConfiguredSkills()`, look up the target skill. If `managed: false`, skip the plan system entirely — unmanaged skills have no lockfile entry or canonical files, so the only action is removing the settings marker via `ws.removeSkill(name)`. Log a message (e.g., "Removed unmanaged skill marker 'my-skill'") and return. For managed skills, the existing plan-based flow is unchanged.

**`skills/list/handler.ts`** — currently reads only from `getLockedSkills()`. Must also read from `getConfiguredSkills()`. Settings is the source of truth for desired state; lockfile enriches with derived data.

1. **Settings** (`getConfiguredSkills()`) — primary source: all configured skills with `managed` and `enabled` flags.
2. **Lockfile** (`getLockedSkills()`) — enriches managed skills with resolved data: source type, version, agents, timestamps.

Display logic: iterate configured skills. For managed entries, enrich with lockfile data where available. Unmanaged entries display name only (no lockfile counterpart). Show status indicators: `(disabled)`, `(unmanaged)`.

**`skills/install/handler.ts`** — when writing the skill entry via `ws.setSkill()`, the workspace service handles normalization. No handler change needed since install always writes `enabled: true, managed: true` (the default, collapsed to a string).

**`skills/fork/handler.ts`** — no changes. Fork reads from `getLockedSkills()`, not `getInstalledSkills()`. Forking disabled or unmanaged skills is valid — fork copies skill content to a new location regardless of lifecycle state.

### 7. Skills command registration

`packages/cli/src/cli-commands/skills/command.ts` — register three new subcommands:

```typescript
.command(enableCommand)
.command(disableCommand)
.command(renameCommand)
```

### 8. Operation type union for update plans

The update plan currently uses `Plan<InstallSkillOperation>`. With rename detection, it becomes `Plan<InstallSkillOperation | UninstallSkillOperation>`. The operation handler registry expands:

```typescript
ws.resolvePlan(plan, {
  "install-skill": installSkill,
  "uninstall-skill": uninstallSkill,
});
```

This reuses existing operation handlers — no new handler needed for the update-with-rename case. Type-safe via the existing `Handlers<Op>` exhaustive mapping type.

## Risks / Trade-offs

**Re-enable requires re-install from source** → Disable removes canonical files (necessary to prevent agents that read directly from canonical from seeing disabled skills). Re-enable must re-resolve the source and re-install: registry sources re-download from the registry, local sources re-copy from the local path, git sources re-clone. The primary value of disable is preserving the settings and lockfile entries (source, flags, resolved version). If re-download latency becomes a pain point, a future change can add a "disabled" staging area that preserves canonical files outside the agent-visible path.

**Plan system for single-operation commands (enable/disable) adds ceremony** → The plan is trivially simple (one step) but gives users consistent `--preview`/`--yes` behavior. The alternative (direct mutation) would save a few lines but break UX consistency.

**Rename detection for multi-skill sources is limited to reporting** → No automatic inference. False positives (guessing wrong rename) would be worse than asking the user to run `axm skills rename`. Single-skill sources get automatic detection since the mapping is unambiguous.

**SkillsMap type change ripples through callers** → `getInstalledSkills()` return type changes from `Record<string, string>` to `Record<string, NormalizedSkillEntry>` (managed entries only). New `getConfiguredSkills()` returns all entries (managed + unmanaged). Currently only the update handler calls `getInstalledSkills()` directly — install and fork read from the lockfile via `getLockedSkills()`. The update handler switches to `getConfiguredSkills()` and filters to managed + enabled, extracting source via `Option.getOrThrow(entry.source)` (safe because only managed entries remain). The new enable/disable/rename handlers, modified uninstall handler, and modified list handler (see Section 6) use `getConfiguredSkills()` and branch on the `managed` flag.

## Open Questions

- Should `axm skills enable` show a different message for sources that require re-download vs local re-copy? Could be helpful UX but adds complexity.
