## Why

Lockfile reads and writes are currently scattered across standalone functions (`readLockfile`, `writeLockfile`, `updateLockEntry`, `removeLockEntry`) that each take an `axmDir` path and independently access the filesystem. This mirrors the exact problems that `SettingsService` solved for settings: (1) concurrent operations can race on the lockfile — install/uninstall executors run concurrently during plan apply with no serialization, and (2) every call site must thread the workspace path, coupling callers to path resolution instead of a clean service boundary.

A dedicated `LockfileService` centralizes all lockfile I/O behind an Effect service with built-in concurrency control, eliminating race conditions and removing path threading from callers.

## What Changes

- **New `LockfileService`** — Effect service with targeted query and mutation methods (e.g. `getSkills`, `getEntry`, `updateEntry`, `removeEntry`), backed by an Effect `Semaphore` (permit = 1) to serialize mutations. No generic read/write — callers use purpose-specific methods only.
- **Lockfile auto-creation** — `LockfileService` creates `axm-lock.yaml` with empty lockfile (`{ lockfileVersion: 1, skills: {} }`) if it doesn't exist on first access. File lifecycle is fully internal to the service.
- **Workspace integration** — `LockfileService` depends on `Workspace` for path resolution; callers no longer pass `axmDir`
- **Remove `getLockfile()` from `WorkspaceContextService`** — Callers use `LockfileService` directly instead of `ws.getLockfile()`
- **Migrate callers** — Install/uninstall handlers read lockfile via `LockfileService.getSkills()` instead of `ws.getLockfile()`. Install/uninstall executors call `LockfileService.updateEntry()` / `LockfileService.removeEntry()` instead of standalone functions.
- **Remove standalone I/O functions from public API** — `readLockfile`, `writeLockfile`, `updateLockEntry`, `removeLockEntry` become internal or removed. Only constants (`LOCKFILE_NAME`), error types, schema types, and `LockfileService` remain exported.

## Capabilities

### New Capabilities

- `lockfile-service`: Effect service with targeted query/mutation methods for the lockfile, concurrency-safe writes, auto-creation of lockfile, and workspace path resolution

### Modified Capabilities

- `skills-install-execute`: Install executor updates lockfile via `LockfileService.updateEntry()` instead of standalone `updateLockEntry(axmDir, ...)`
- `skills-uninstall-execute`: Uninstall executor reads and updates lockfile via `LockfileService` instead of standalone functions and `ws.getLockfile()`

## Impact

- **`packages/cli/src/lockfile/`** — New `service.ts` with `LockfileService` tag and layer; existing I/O functions become internal; public API narrows to service + types + errors + constants
- **`packages/cli/src/lockfile/index.ts`** — Barrel updated: remove I/O function exports, add `LockfileService` export
- **`packages/cli/src/workspace/service.ts`** — Remove `getLockfile()` from `WorkspaceContextService` interface; workspace initialization lockfile writes remain internal (raw functions)
- **`packages/cli/src/cli-commands/skills/install/handler.ts`** — Reads lockfile via `LockfileService.getSkills()` instead of `ws.getLockfile()`
- **`packages/cli/src/cli-commands/skills/install/install-skill.ts`** — Calls `LockfileService.updateEntry()` instead of standalone `updateLockEntry`; gains `LockfileService` dependency
- **`packages/cli/src/cli-commands/skills/uninstall/handler.ts`** — Reads lockfile via `LockfileService` instead of `ws.getLockfile()`
- **`packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts`** — Calls `LockfileService.updateEntry()` / `LockfileService.removeEntry()` instead of standalone functions; reads lockfile via `LockfileService` instead of `ws.getLockfile()`; gains `LockfileService` dependency
- **Test files** — Handler, workspace, install/uninstall executor tests need updated layers providing `LockfileService`; tests no longer mock `getLockfile` on workspace context
