## Context

Lockfile I/O is currently implemented as standalone functions in `lockfile/lockfile.ts` (`readLockfile`, `writeLockfile`, `updateLockEntry`, `removeLockEntry`). Each function accepts an `axmDir` string and directly accesses `FileSystem`. Callers (install handler, uninstall handler, install executor, uninstall executor) must thread the workspace path through and manage their own concurrency — there is currently no serialization at all, meaning concurrent install/uninstall operations during plan apply can race on the lockfile.

The `WorkspaceContextService` wraps reads via `getLockfile()` but writes bypass it entirely, going through standalone functions with raw `axmDir` paths. There is no centralized write coordination.

This follows the exact same pattern that `SettingsService` already solved for `settings.json`. The design mirrors `SettingsService` closely, applying the same architectural decisions to the lockfile.

## Goals / Non-Goals

**Goals:**

- Centralize all lockfile I/O behind a single Effect service with targeted methods
- Serialize mutations (read-modify-write) with an Effect `Semaphore` to prevent data races
- Remove `axmDir` threading from callers — service owns path resolution via `Workspace`
- Auto-create lockfile when it doesn't exist (file lifecycle internal to service)
- Remove `getLockfile()` from `WorkspaceContextService` — callers use `LockfileService` directly
- Maintain existing error types (`LockfileNotFoundError`, `LockfileParseError`, `LockfileWriteError`)

**Non-Goals:**

- In-memory caching or change notification — every read goes to disk
- Locking across OS processes (file-level locking) — out of scope, single-process only
- Changing the lockfile file format or schema
- Modifying the settings service (separate concern)

## Decisions

### 1. Effect service with `Context.Tag`

**Decision:** `LockfileService` is an Effect service accessed via `Context.Tag`, following the same pattern as `SettingsService` and `Workspace`.

**Rationale:** Consistent with `SettingsService`. Enables DI, testability via mock layers, and clean dependency tracking through Effect's `R` parameter.

**Alternatives:**

- Module-level singleton — breaks testability and Effect conventions
- Extend `WorkspaceContextService` — violates single responsibility; workspace handles plan resolution, not file I/O

### 2. Semaphore(1) for write serialization

**Decision:** Use `Effect.Semaphore` with 1 permit to serialize all mutations. Reads outside mutations are unserialized (they just read the file). Mutation methods (`updateEntry`, `removeEntry`) acquire the semaphore for their full read-modify-write cycle.

**Rationale:** Identical to `SettingsService`. Semaphore(1) is the idiomatic Effect primitive for mutual exclusion. Serializes concurrent writes without blocking reads, composes naturally with `Effect.gen`.

**Alternatives:**

- `Effect.Queue` — adds ordering semantics we don't need
- `Ref<Lockfile>` with in-memory state — introduces caching and staleness
- No concurrency control — status quo, known to cause races during concurrent installs

### 3. Service depends on Workspace for path, not the reverse

**Decision:** `LockfileService` layer requires `Workspace` to resolve `path`. `getLockfile()` is removed from `WorkspaceContextService` entirely — callers use `LockfileService` directly.

**Rationale:** Same as `SettingsService`. `Workspace` already owns path resolution. Removing `getLockfile()` from workspace eliminates the indirect delegation pattern and makes the dependency graph clearer.

**Alternatives:**

- Keep `getLockfile()` on workspace as convenience — adds indirection without value

### 4. Targeted methods only — no generic read/write

**Decision:** The service exposes purpose-specific query and mutation methods. No generic `read()`, `write()`, or `update()`.

```typescript
interface LockfileService {
  // --- Queries (read from disk, no semaphore) ---
  readonly getSkills: () => Effect<SkillsLockMap, LockfileError>;
  readonly getEntry: (skillName: string) => Effect<Option<SkillLockEntry>, LockfileError>;

  // --- Mutations (acquire semaphore for read-modify-write) ---
  readonly updateEntry: (skillName: string, entry: SkillLockEntry) => Effect<void, LockfileError>;
  readonly removeEntry: (skillName: string) => Effect<void, LockfileError>;
}
```

**Rationale:** Targeted methods enforce a clear contract. `getSkills` replaces `ws.getLockfile()` for callers that read the full skills map. `getEntry` provides single-skill lookup for partial uninstall. `updateEntry` replaces `updateLockEntry` — auto-sets `updatedAt`. `removeEntry` replaces `removeLockEntry`. New operations are added as new methods.

**Alternatives:**

- Generic `read`/`write`/`update` — gives callers too much power, easier to accidentally overwrite concurrent changes
- Return full `Lockfile` from queries — callers don't need `lockfileVersion`, just the skills map

### 5. Auto-create lockfile on first access

**Decision:** `LockfileService` internally creates `axm-lock.yaml` with `{ lockfileVersion: 1, skills: {} }` if the file doesn't exist when any query or mutation method is called. This matches the existing `readLockfile` behavior which already returns an empty lockfile when the file is missing.

**Rationale:** Keeps file lifecycle fully internal to the service. Callers never need to worry about whether the file exists.

### 6. Standalone functions become internal

**Decision:** `readLockfile` and `writeLockfile` remain as internal implementation functions — exported from `lockfile/lockfile.ts` but not from the barrel `lockfile/index.ts`. `updateLockEntry` and `removeLockEntry` are removed entirely (replaced by service methods). The public API becomes `LockfileService` + types + errors + constants + schemas.

Remaining barrel exports: `LockfileService`, `LockfileServiceLive`, error types, schema types/schemas, `LOCKFILE_NAME`.

**Rationale:** Same as `SettingsService`. The semaphore lives in the service layer. Workspace initialization can still import raw functions directly from `lockfile/lockfile.ts` (not through the barrel).

### 7. Migrate callers

**Decision:** All callers migrate in one change:

| Caller                 | Before                                                             | After                                                                                                   |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `install/handler.ts`   | `ws.getLockfile()`                                                 | `LockfileService.getSkills()`                                                                           |
| `uninstall/handler.ts` | `ws.getLockfile()`                                                 | `LockfileService.getSkills()`                                                                           |
| `install-skill.ts`     | `updateLockEntry(axmDir, ...)`                                     | `LockfileService.updateEntry(...)`                                                                      |
| `uninstall-skill.ts`   | `ws.getLockfile()`, `updateLockEntry(...)`, `removeLockEntry(...)` | `LockfileService.getEntry(...)`, `LockfileService.updateEntry(...)`, `LockfileService.removeEntry(...)` |

**Rationale:** Single atomic migration avoids intermediate states where some callers use the service and others use raw functions.

## Risks / Trade-offs

**[Single-process only]** → Semaphore doesn't protect against concurrent CLI invocations writing the same file. Mitigation: matches current behavior and `SettingsService`; cross-process locking is a future enhancement if needed.

**[Workspace initialization ordering]** → `initializeProjectWorkspace` and `initializeGlobalWorkspace` write lockfiles before `LockfileService` exists in the layer graph. → Mitigation: initialization continues importing raw `writeLockfile` directly from `lockfile/lockfile.ts` (not through the barrel); `LockfileService` wraps only post-initialization usage.

**[Read staleness]** → Unserialized reads may return stale data if a concurrent write is in progress. → Mitigation: acceptable for current use cases (plan building). Critical read-modify-write cycles go through mutation methods which hold the semaphore.

**[Wider R channel on executors]** → Adding `LockfileService` as a dependency to install/uninstall executors changes their `R` channel (they currently depend on `FileSystem` directly for lockfile I/O). → Mitigation: `LockfileService` is provided by the same runtime layer that provides `Workspace` and `FileSystem`, so no additional wiring is needed at the command level.

**[`node:path` usage]** → The current lockfile module uses `node:path` for path joins. The service layer should use `@effect/platform` `Path` instead, per project conventions. → Mitigation: the internal `readLockfile`/`writeLockfile` functions can be migrated to use `Path` from the service layer context, or this can be deferred to a separate cleanup.
