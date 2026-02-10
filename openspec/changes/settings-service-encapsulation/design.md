## Context

The settings service (`settings/service.ts`) and lockfile service (`lockfile/service.ts`) are currently public Effect services, exported from their barrel files and provided in the shared runtime layer. Command handlers access them directly for skill, agent, and lockfile operations.

Meanwhile, the workspace service (`workspace/service.ts`) already handles source and scope operations by reading settings files directly — it doesn't go through `SettingsService` for these. This creates:

1. **Three independent semaphores** writing to workspace state: settings service (skills/agents → `settings.json`), workspace service (`addSource` → `settings.json`), lockfile service (lock entries → `axm-lock.yaml`)
2. **Race condition**: `setInstalledSkill` and `addConfiguredSource` use different semaphores but write to the same `settings.json`
3. **Cross-file interleaving**: Install operations span both files (settings + lockfile). With separate semaphores, concurrent installs can interleave — one operation writes to settings while another writes to the lockfile, or an operation can succeed on one file and fail on the other, leaving workspace in an inconsistent state

## Goals / Non-Goals

**Goals:**

- Make workspace the sole public gateway for all settings and lockfile access
- Consolidate ALL mutation serialization under a single workspace semaphore, ensuring operations that span both files are serialized (no interleaving)
- Remove settings and lockfile services from public API and runtime layer — workspace uses I/O functions directly

**Non-Goals:**

- Changing I/O function behavior (read/write, format-preserving JSON, YAML handling, readOrCreate pattern)
- Changing the settings file format, lockfile format, or schemas
- Adding new capabilities beyond what exists today
- Full transactional rollback (if settings write succeeds but lockfile write fails, we don't roll back settings)

## Decisions

### 1. Single semaphore at workspace level for ALL state mutations

**Decision**: Remove semaphores from both `SettingsService` and `LockfileService`. Workspace owns a single `Semaphore(1)` that serializes ALL state mutations: `setSkill`, `removeSkill` (compound, both files), `addConfiguredAgent`, and `addConfiguredSource` (settings only).

**Rationale**: Install/uninstall operations span both files. Separate semaphores allow interleaving across files during concurrent operations. A single semaphore ensures each operation completes its full write cycle (settings + lockfile) before another begins. This also fixes the existing race between `addConfiguredSource` (workspace semaphore) and `setSkill` (settings semaphore) on `settings.json`.

**Alternative considered**: Keep per-file semaphores and add an outer operation-level lock. Rejected because it adds complexity (nested locking) without benefit — the single semaphore is simpler and sufficient given these are fast local file writes.

### 2. Workspace uses I/O functions directly, no internal service delegation

**Decision**: Add compound skill mutations (`setSkill`, `removeSkill`), skill/lockfile queries (`getInstalledSkills`, `getLockedSkills`, `getLockedSkill`), and configured agent methods (`getConfiguredAgents`, `addConfiguredAgent`) to `WorkspaceContextService` interface. Rename existing methods to follow the naming convention (`getConfiguredSources`, `getConfiguredScope`, etc.). Workspace implements these by calling I/O functions (`readSettings`, `writeSettings`, `modifyJsonFile`, `readLockfile`, `writeLockfile`) directly — the same pattern workspace already uses for source and scope operations. Compound skill methods acquire the semaphore once and write to both files sequentially.

**Rationale**: Workspace already calls I/O functions directly for its existing methods. The services' only value-add beyond the raw I/O functions was the semaphore and read-modify-write cycle — both of which workspace now owns. Instantiating the services internally would create unnecessary indirection (services that need external serialization discipline and exist only to be called by one consumer). The I/O functions (`readSettings`, `writeSettings`, `modifyJsonFile`, `readLockfile`, `writeLockfile`) are well-tested and encapsulate format-preserving JSON, YAML handling, and readOrCreate patterns.

**Alternative considered**: Instantiate `SettingsService` and `LockfileService` as plain objects within workspace's `make` function and delegate to them. Rejected because it adds a layer of indirection with no benefit — the services would be stripped of their semaphores and called by exactly one consumer, making them thin wrappers over the I/O functions that workspace can call directly.

### 3. Barrel files export only types and I/O utilities

**Decision**: Remove service tags, layers, and interfaces from `settings/index.ts` and `lockfile/index.ts`. Keep exporting schemas, types, error classes, and I/O functions since workspace and other modules use these directly.

**Rationale**: The I/O functions and schemas are value types with no service dependencies — they're safe to use anywhere. Only the service wrappers (which manage state) need encapsulation.

### 4. Query methods remain non-blocking

**Decision**: Query methods (`getInstalledSkills`, `getConfiguredAgents`, `getConfiguredScope`, `getConfiguredSources`, `getConfiguredSourceByName`, `getConfiguredRegistrySources`, `getLockedSkills`, `getLockedSkill`) do NOT acquire the semaphore, consistent with the existing pattern.

**Rationale**: Queries read from disk on each call and don't perform read-modify-write cycles. Blocking queries behind the mutation semaphore would reduce throughput without preventing inconsistency (the file could change between a query returning and the caller acting on the result anyway).

## Risks / Trade-offs

**[Risk] Tests that mock SettingsService or LockfileService directly will break** → Tests should mock `Workspace` instead, or import the service directly from its module file (not barrel) for unit-testing the internal implementation.

**[Trade-off] Workspace interface grows larger** → The interface gains ~10 methods. Acceptable because workspace is the central coordination point and the methods are thin wrappers over I/O functions. The interface remains coherent (all workspace state operations in one place).

**[Trade-off] Reduced mutation concurrency** → All mutations serialize globally, even if they touch different files. Acceptable because these are fast local file writes where the serialization overhead is negligible, and the consistency guarantee outweighs the throughput cost.

**[Trade-off] No transactional rollback** → If a cross-file operation (e.g., install) succeeds writing to settings but fails writing to lockfile, settings is not rolled back. This is acceptable for now — the semaphore prevents interleaving but doesn't guarantee atomicity across files. A future enhancement could add compensating writes on failure.
