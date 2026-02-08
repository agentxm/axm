## Why

Settings reads and writes are currently scattered across standalone functions (`readSettings`, `writeSettings`, `updateSettings`, `addSkill`, `addAgentToWorkspace`) that each take an `axmDir` path and independently access the filesystem. This creates two problems: (1) concurrent operations can race on the settings file — `ensure-agents.ts` already works around this with `concurrency: 1` — and (2) every call site must know the workspace path, coupling callers to path resolution instead of a clean service boundary.

A dedicated `SettingsService` centralizes all settings I/O behind an Effect service with built-in concurrency control, eliminating race conditions and removing path threading from callers.

## What Changes

- **New `SettingsService`** — Effect service with targeted query and mutation methods (e.g. `getScope`, `getAgents`, `addSkill`, `addAgent`, `removeSkill`), backed by an Effect `Semaphore` (permit = 1) to serialize mutations. No generic read/write/update — callers use purpose-specific methods only.
- **Settings file auto-creation** — `SettingsService` creates `settings.json` with `{}` if it doesn't exist on first access. File lifecycle is fully internal to the service.
- **Workspace integration** — `SettingsService` depends on `Workspace` for path resolution; callers no longer pass `axmDir`
- **Remove `getSettings()` from `WorkspaceContextService`** — Callers use `SettingsService` directly instead of `ws.getSettings()`
- **Install/uninstall executors write settings** — `install-skill.ts` calls `SettingsService.addSkill()` after successful installation; `uninstall-skill.ts` calls `SettingsService.removeSkill()` after removal. Settings and lockfile stay in sync.
- **Migrate callers** — `ensure-agents.ts`, install handler, and init handler use `SettingsService` instead of direct function calls or `ws.getSettings()`
- **Remove standalone I/O functions from public API** — `readSettings`, `writeSettings`, `updateSettings`, `addSkill`, `addAgentToWorkspace`, `getEffectiveScope`, `ensureInitializedLegacy` become internal or removed. Only constants (`SETTINGS_FILENAME`, `DEFAULT_SCOPE`), error types, schema types, and `createDefaultSettings` remain exported.
- **Remove `SettingsUpdate`/`SkillsUpdate` from exports** — Only used internally by `updateSettings`; no external consumers.

## Capabilities

### New Capabilities

- `settings-service`: Effect service with targeted query/mutation methods for settings, concurrency-safe writes, auto-creation of settings file, and workspace path resolution

### Modified Capabilities

- `skills-install-execute`: Install executor writes skill entry to settings via `SettingsService.addSkill()` after successful installation
- `skills-uninstall-execute`: Uninstall executor removes skill entry from settings via `SettingsService.removeSkill()` after successful removal

## Impact

- **`packages/cli/src/settings/`** — New `service.ts` with `SettingsService` tag and layer; existing I/O functions become internal; `ensureInitializedLegacy` and `getEffectiveScope` removed
- **`packages/cli/src/settings/index.ts`** — Barrel updated: remove I/O function exports, add `SettingsService` export
- **`packages/cli/src/workspace/service.ts`** — Remove `getSettings()` from `WorkspaceContextService` interface; workspace initialization settings writes remain internal (raw functions)
- **`packages/cli/src/workspace/ensure-agents.ts`** — Uses `SettingsService.addAgent()` instead of `addAgentToWorkspace()`; remove `concurrency: 1` workaround; remove `getSettings` from `EnsureAgentsOptions`
- **`packages/cli/src/cli-commands/skills/install/handler.ts`** — Reads agents via `SettingsService.getAgents()` instead of `context.getSettings()` (via `WorkspaceContextTag`)
- **`packages/cli/src/cli-commands/skills/install/install-skill.ts`** — Calls `SettingsService.addSkill()` after successful installation; gains `SettingsService` dependency
- **`packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts`** — Calls `SettingsService.removeSkill()` after successful removal; gains `SettingsService` dependency
- **`packages/cli/src/cli-commands/init/handler.ts`** — Reads agents via `SettingsService.getAgents()` instead of `context.getSettings()`
- **Test files** — Handler, workspace, and ensure-agents tests need updated layers providing `SettingsService`; ensure-agents tests no longer use `readSettings` directly
