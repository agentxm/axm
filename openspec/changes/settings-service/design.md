## Context

Settings I/O is currently implemented as standalone functions in `settings/settings.ts` (`readSettings`, `writeSettings`, `updateSettings`, `addSkill`, `addAgentToWorkspace`). Each function accepts an `axmDir` string and directly accesses `FileSystem`. Callers (workspace service, ensure-agents, install handler, init handler) must thread the workspace path through and manage their own concurrency — `ensure-agents.ts` uses `concurrency: 1` as a manual workaround to prevent concurrent file writes.

The `WorkspaceContextService` wraps reads via `getSettings()` but writes bypass it entirely, going through standalone functions. There is no centralized write coordination.

Additionally, install/uninstall skill executors currently only update the lockfile — they do not write skill entries to settings. This means settings and lockfile can drift out of sync.

## Goals / Non-Goals

**Goals:**

- Centralize all settings file I/O behind a single Effect service with targeted methods
- Serialize mutations (read-modify-write) with an Effect `Semaphore` to prevent data races
- Remove `axmDir` threading from callers — service owns path resolution via `Workspace`
- Auto-create settings file when it doesn't exist (file lifecycle internal to service)
- Remove `getSettings()` from `WorkspaceContextService` — callers use `SettingsService` directly
- Have install/uninstall executors update settings to keep skills in sync with lockfile
- Maintain existing error types (`SettingsNotFoundError`, `SettingsParseError`, `SettingsWriteError`)
- Remove dead exports: `ensureInitializedLegacy`, `getEffectiveScope`, `SettingsUpdate`, `SkillsUpdate`

**Non-Goals:**

- In-memory caching or change notification — every read goes to disk
- Locking across OS processes (file-level locking) — out of scope, single-process only
- Changing the settings file format or schema
- Modifying the lockfile service (separate concern)
- `getSources` method — no current consumer, defer until needed

## Decisions

### 1. Effect service with `Context.Tag`

**Decision:** `SettingsService` is an Effect service accessed via `Context.Tag`, following the same pattern as `Workspace`.

**Rationale:** Consistent with the codebase's existing service pattern. Enables DI, testability via mock layers, and clean dependency tracking through Effect's `R` parameter.

**Alternatives:**

- Module-level singleton — breaks testability and Effect conventions
- Extend `WorkspaceContextService` — violates single responsibility; workspace handles plan resolution, not file I/O

### 2. Semaphore(1) for write serialization

**Decision:** Use `Effect.Semaphore` with 1 permit to serialize all mutations. Reads outside mutations are unserialized (they just read the file). Mutation methods (`addSkill`, `removeSkill`, `addAgent`) acquire the semaphore for their full read-modify-write cycle.

**Rationale:** Semaphore(1) is the idiomatic Effect primitive for mutual exclusion. It serializes concurrent writes without blocking reads, and composes naturally with `Effect.gen`. Simpler than a queue (no explicit ordering needed) and more composable than `Ref` (which would require caching semantics we don't want).

**Alternatives:**

- `Effect.Queue` — adds ordering semantics we don't need; more complex API surface
- `Ref<Settings>` with in-memory state — introduces caching, staleness, and consistency issues with disk
- No concurrency control — status quo, known to cause races

### 3. Service depends on Workspace for path, not the reverse

**Decision:** `SettingsService` layer requires `Workspace` to resolve `path`. `getSettings()` is removed from `WorkspaceContextService` entirely — callers use `SettingsService` directly.

**Rationale:** `Workspace` already owns path resolution and initialization. `SettingsService` is a focused I/O service that needs to know _where_ to read/write — `Workspace.path` provides that. Removing `getSettings()` from workspace eliminates the indirect delegation pattern and makes the dependency graph clearer.

**Alternatives:**

- Keep `getSettings()` on workspace as convenience — adds indirection without value
- Circular dependency (each depends on the other) — Effect layers don't support this cleanly

### 4. Targeted methods only — no generic read/write/update

**Decision:** The service exposes purpose-specific query and mutation methods. No generic `read()`, `write()`, or `update()`.

```typescript
interface SettingsService {
  // --- Queries (read from disk, no semaphore) ---
  readonly getScope: () => Effect<string, SettingsError>;
  readonly getAgents: () => Effect<ReadonlyArray<string>, SettingsError>;
  readonly getSkills: () => Effect<SkillsMap, SettingsError>;

  // --- Mutations (acquire semaphore for read-modify-write) ---
  readonly addSkill: (name: string, version: string) => Effect<void, SettingsError>;
  readonly removeSkill: (name: string) => Effect<void, SettingsError>;
  readonly addAgent: (agentId: string) => Effect<void, SettingsError>;
}
```

**Rationale:** Targeted methods enforce a clear contract — callers express intent ("add this skill") rather than manipulating raw settings objects. This prevents accidental overwrites, makes the API self-documenting, and keeps the concurrency boundary tight (each mutation is a complete read-modify-write under the semaphore). New operations are added as new methods, not by exposing raw read/write.

**Alternatives:**

- Generic `read`/`write`/`update` — gives callers too much power, harder to reason about what mutations are happening, easier to accidentally overwrite concurrent changes

### 5. Auto-create settings file on first access

**Decision:** `SettingsService` internally creates `settings.json` with `{}` if the file doesn't exist when any query or mutation method is called. This replaces `ensureInitializedLegacy` and the global workspace init logic for settings.

**Rationale:** Keeps file lifecycle fully internal to the service. Callers never need to worry about whether the file exists — the service handles it. This also eliminates the deprecated `ensureInitializedLegacy` function and simplifies `ensureGlobalWorkspaceInitialized`.

### 6. Standalone functions become internal

**Decision:** `readSettings` and `writeSettings` remain as internal implementation functions — exported from `settings/settings.ts` but not from the barrel `settings/index.ts`. The public API becomes `SettingsService`. `getEffectiveScope` (zero callers), `ensureInitializedLegacy` (deprecated), `updateSettings`, `addSkill`, `addAgentToWorkspace`, `SettingsUpdate`, and `SkillsUpdate` are removed from exports entirely.

Remaining barrel exports: `SettingsService`, error types, schema types, `createDefaultSettings`, `DEFAULT_SCOPE`, `SETTINGS_FILENAME`.

**Rationale:** Keeps implementation simple — the semaphore lives in the service layer, not in the raw functions. Workspace initialization can still import raw functions directly from `settings/settings.ts` (not through the barrel).

### 7. Install/uninstall executors update settings

**Decision:** `install-skill.ts` calls `SettingsService.addSkill()` after successful installation. `uninstall-skill.ts` calls `SettingsService.removeSkill()` after successful full removal. Both gain `SettingsService` as a dependency in their `R` channel.

**Rationale:** Currently install/uninstall only update the lockfile, leaving settings and lockfile potentially out of sync. Having executors write to both keeps them consistent. The semaphore in `SettingsService` means these calls are safe even when multiple skills are being installed/uninstalled concurrently within a plan.

**Alternatives:**

- Keep settings updates separate from plan execution — status quo, known to cause drift

## Risks / Trade-offs

**[Single-process only]** → Semaphore doesn't protect against concurrent CLI invocations writing the same file. Mitigation: this matches the current behavior; cross-process locking is a future enhancement if needed.

**[Workspace initialization ordering]** → `initializeProjectWorkspace` writes settings before `SettingsService` exists in the layer graph. → Mitigation: initialization continues importing raw `writeSettings` directly from `settings/settings.ts` (not through the barrel); `SettingsService` wraps only post-initialization usage.

**[Read staleness]** → Unserialized reads may return stale data if a concurrent write is in progress. → Mitigation: acceptable for current use cases (display, planning). Critical read-modify-write cycles go through mutation methods which hold the semaphore.

**[Settings write during plan apply]** → Adding `SettingsService` as a dependency to install/uninstall executors widens their `R` channel. → Mitigation: `SettingsService` is provided by the same runtime layer that provides `Workspace` and `FileSystem`, so no additional wiring is needed at the command level.
