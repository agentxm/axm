> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Expand Workspace Service with New Methods

> **Subagent:** Run this entire phase in a single subagent.

Add new query and compound mutation methods to `WorkspaceContextService`. Workspace calls I/O functions directly (`readSettings`, `writeSettings`, `modifyJsonFile`, `readLockfile`, `writeLockfile`) — it does NOT delegate to `SettingsService` or `LockfileService`. Consolidate the semaphore so ALL mutations (`setSkill`, `removeSkill`, `addConfiguredAgent`, and existing `addSource`) serialize under one `Semaphore(1)`. Query methods (`getInstalledSkills`, `getConfiguredAgents`, `getLockedSkills`, `getLockedSkill`) do NOT acquire the semaphore.

`readLockfile` is not currently exported from `lockfile/index.ts` — add it to the barrel export so workspace can import it alongside the already-exported `writeLockfile`.

- [x] 1.1 Export `readLockfile` from `lockfile/index.ts` barrel
- [x] 1.2 Write tests for `getInstalledSkills` and `getConfiguredAgents` query methods in `workspace/service.test.ts`
- [x] 1.3 Write tests for `getLockedSkills` and `getLockedSkill` query methods
- [x] 1.4 Write tests for `setSkill` compound mutation (install new, update existing, writes both files under single semaphore)
- [x] 1.5 Write tests for `removeSkill` compound mutation (remove existing, no-op for non-existent)
- [x] 1.6 Write tests for `addConfiguredAgent` mutation (add new, no-op for existing, fail for invalid)
- [x] 1.7 Write tests for single-semaphore serialization (concurrent `setSkill` and `addConfiguredSource` do not interleave)
- [x] 1.8 Implement `getInstalledSkills`, `getConfiguredAgents`, `getLockedSkills`, `getLockedSkill` on `WorkspaceContextService` interface and `WorkspaceContextServiceLive`
- [x] 1.9 Implement `setSkill` and `removeSkill` compound mutations — acquire semaphore once, write both settings and lockfile sequentially
- [x] 1.10 Implement `addConfiguredAgent` mutation — acquire semaphore, write settings
- [x] 1.11 Consolidate existing `addSource` to use the same semaphore instance as new mutations (it already has its own — unify)
- [x] 1.12 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 1.13 Run lint (`pnpm lint`), fix any errors
- [x] 1.14 Run tests (`pnpm test`), fix any failures
- [x] 1.15 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 1.16 Kill any vitest worker processes

## 2. Rename Existing Workspace Methods

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

Rename existing workspace methods to follow the `getConfigured*` naming convention. Update the interface, implementation, all callers (handlers, tests, internal references). Methods to rename:

- `getSources` → `getConfiguredSources`
- `getSourceByName` → `getConfiguredSourceByName`
- `getRegistrySources` → `getConfiguredRegistrySources`
- `getScope` → `getConfiguredNamespace`
- `addSource` → `addConfiguredSource`

- [x] 2.1 Rename methods on `WorkspaceContextService` interface and `WorkspaceContextServiceLive` implementation
- [x] 2.2 Update workspace service tests (`workspace/service.test.ts`) with renamed methods
- [x] 2.3 Update all command handler files that call renamed workspace methods (search for `ws.getSources`, `ws.getSourceByName`, `ws.getRegistrySources`, `ws.getScope`, `ws.addSource` and `workspace.` variants across all handlers and tests)
- [x] 2.4 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 2.5 Run lint (`pnpm lint`), fix any errors
- [x] 2.6 Run tests (`pnpm test`), fix any failures
- [x] 2.7 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Migrate Command Handlers from SettingsService/LockfileService to Workspace

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7 are independent — launch as parallel subagents.

Depends on: Phase 1, Phase 2

Replace all direct `SettingsService` and `LockfileService` usage in command handlers with equivalent `Workspace` methods. Each task covers the handler implementation AND its tests. Mapping:

| Old (SettingsService / LockfileService) | New (Workspace)                        |
| --------------------------------------- | -------------------------------------- |
| `ss.getSkills()`                        | `ws.getInstalledSkills()`              |
| `ss.addSkill(name, source)`             | `ws.setSkill(name, source, lockEntry)` |
| `ss.removeSkill(name)`                  | `ws.removeSkill(name)`                 |
| `ss.getAgents()`                        | `ws.getConfiguredAgents()`             |
| `ss.addAgent(agentId)`                  | `ws.addConfiguredAgent(agentId)`       |
| `ls.getSkills()`                        | `ws.getLockedSkills()`                 |
| `ls.getEntry(name)`                     | `ws.getLockedSkill(name)`              |
| `ls.updateEntry(name, entry)`           | `ws.setSkill(name, source, entry)`     |
| `ls.removeEntry(name)`                  | `ws.removeSkill(name)`                 |

Note: `setSkill` replaces separate `ss.addSkill` + `ls.updateEntry` calls — the handler no longer needs to coordinate two services.

- [x] 3.1 Migrate `init` handler (`cli-commands/init/handler.ts`) and tests — replace `SettingsService.getAgents()` with `Workspace.getConfiguredAgents()`
- [x] 3.2 Migrate `skills/install` handler (`handler.ts`, `install-skill.ts`) and tests — replace `SettingsService.addSkill` + `LockfileService.updateEntry` with `Workspace.setSkill`; replace `LockfileService.getSkills` with `Workspace.getLockedSkills`
- [x] 3.3 Migrate `skills/fork` handler (`handler.ts`) and tests — replace `SettingsService.getAgents()` with `Workspace.getConfiguredAgents()`
- [x] 3.4 Migrate `skills/list` handler (`handler.ts`) and tests — replace `LockfileService.getSkills` with `Workspace.getLockedSkills`
- [x] 3.5 Migrate `skills/uninstall` handler (`handler.ts`, `uninstall-skill.ts`) and tests — replace `SettingsService.removeSkill` + `LockfileService.removeEntry`/`updateEntry` with `Workspace.removeSkill`/`setSkill`; replace `LockfileService.getSkills`/`getEntry` with `Workspace.getLockedSkills`/`getLockedSkill`
- [x] 3.6 Migrate `sources/parser.ts` and tests — replace `LockfileService.getSkills()` with `Workspace.getLockedSkills()`
- [x] 3.7 Migrate `workspace/ensure-agents.ts` and tests — replace `SettingsService.getAgents()`/`addAgent()` with `Workspace.getConfiguredAgents()`/`addConfiguredAgent()`
- [x] 3.8 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 3.9 Run lint (`pnpm lint`), fix any errors
- [x] 3.10 Run tests (`pnpm test`), fix any failures
- [x] 3.11 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 3.12 Kill any vitest worker processes

## 4. Remove Service Exports and Clean Up Runtime

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3

With no production consumers remaining, remove the services from public API and runtime layer. Add documentation comments.

- [x] 4.1 Remove `SettingsService`, `SettingsServiceLive`, and `SettingsServiceInterface` exports from `settings/index.ts` barrel
- [x] 4.2 Remove `LockfileService` and `LockfileServiceLive` exports from `lockfile/index.ts` barrel
- [x] 4.3 Remove `SettingsServiceLive` and `LockfileServiceLive` from the runtime layer in `runtime/index.ts` (remove the `servicesLayer` composition and its import)
- [x] 4.4 Remove semaphores from `SettingsService` and `LockfileService` implementations (workspace owns serialization)
- [x] 4.5 Add documentation comment to `settings/service.ts` noting it is no longer used in production — workspace calls I/O functions directly
- [x] 4.6 Add documentation comment to `lockfile/service.ts` noting it is no longer used in production — workspace calls I/O functions directly
- [x] 4.7 Add documentation comment to `workspace/service.ts` indicating it is the sole public gateway for all settings and lockfile read/write operations and manages mutation serialization via a single semaphore
- [x] 4.8 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 4.9 Run lint (`pnpm lint`), fix any errors
- [x] 4.10 Run tests (`pnpm test`), fix any failures
- [x] 4.11 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 4.12 Kill any vitest worker processes

## 5. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4

- [x] 5.1 Run full typecheck (`pnpm typecheck`), confirm zero errors
- [x] 5.2 Run full lint (`pnpm lint`), confirm zero warnings
- [x] 5.3 Run full test suite (`pnpm test`), confirm all pass
- [x] 5.4 Run full e2e test suite (`pnpm test:e2e`), confirm all pass
- [x] 5.5 Kill any vitest worker processes
- [x] 5.6 Review key files against spec requirements: verify workspace interface has all specified methods, settings/lockfile barrels no longer export services, runtime layer excludes services, and documentation comments are present
