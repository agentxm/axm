## Why

The settings and lockfile services are currently exported publicly and consumed directly by command handlers, bypassing the workspace service. This creates multiple access paths to workspace state, making it difficult to enforce concurrency invariants and business logic centrally.

There are three independent semaphores today:

1. Settings service: serializes skill/agent mutations to `settings.json`
2. Workspace service: serializes `addSource` mutations to `settings.json`
3. Lockfile service: serializes lockfile mutations to `axm-lock.yaml`

Because install/uninstall operations span both files (add skill to settings AND update lockfile entry), concurrent operations can interleave writes across files. If one operation writes to settings while another writes to the lockfile, or if an operation succeeds on one file but fails on the other, the workspace ends up in an inconsistent state.

The workspace service should be the single owner of all workspace state mutations, with one semaphore serializing all writes to both settings and lockfile.

## What Changes

- **BREAKING**: Remove `SettingsService`, `SettingsServiceLive`, and `SettingsServiceInterface` from the `settings/` barrel export
- **BREAKING**: Remove `LockfileService` and `LockfileServiceLive` from the `lockfile/` barrel export
- **BREAKING**: Remove `SettingsServiceLive` and `LockfileServiceLive` from the shared runtime layer — workspace uses I/O functions directly instead
- Add compound skill methods (`setSkill`, `removeSkill`) to `Workspace` service interface that atomically write to both settings and lockfile under a single semaphore acquisition
- Add skill and lockfile query methods (`getInstalledSkills`, `getLockedSkills`, `getLockedSkill`) and configured agent methods (`getConfiguredAgents`, `addConfiguredAgent`) to `Workspace` service interface
- Consolidate to a single `Semaphore(1)` in workspace that serializes ALL state mutations across both files
- Add documentation comments to settings and lockfile services noting they are no longer used in production (workspace calls I/O functions directly)
- Add documentation comments to the workspace service indicating it manages all state read/write access
- Update all command handlers to use `Workspace` instead of `SettingsService`/`LockfileService`
- Update tests to reflect the new access pattern

## Capabilities

### New Capabilities

_None_ — this is an encapsulation refactor, not a new capability.

### Modified Capabilities

- `settings-service`: Requirements change — the service is no longer a public API or used in production; workspace calls I/O functions directly; semaphore removed (workspace owns serialization)
- `lockfile-service`: Requirements change — the service is no longer a public API or used in production; workspace calls I/O functions directly; semaphore removed (workspace owns serialization)
- `workspace-plan`: Requirements change — workspace service expands its interface to include installed skill, configured agent, and locked skill methods; existing methods renamed to follow naming convention (`getConfigured*`, `getInstalled*`, `getLocked*`); single semaphore serializes all mutations across both files

## Impact

- **settings/**: `service.ts` gets internal-only comments, semaphore removed; barrel file (`index.ts`) stops exporting service, layer, and interface types
- **lockfile/**: `service.ts` gets internal-only comments, semaphore removed; barrel file (`index.ts`) stops exporting service, layer, and interface types
- **workspace/**: `service.ts` gains new methods (`getInstalledSkills`, `getConfiguredAgents`, `addConfiguredAgent`, `getLockedSkills`, `getLockedSkill`, `setSkill`, `removeSkill`); existing methods renamed (`getSources` → `getConfiguredSources`, `getSourceByName` → `getConfiguredSourceByName`, `getRegistrySources` → `getConfiguredRegistrySources`, `getScope` → `getConfiguredScope`, `addSource` → `addConfiguredSource`); single semaphore covers all mutations; barrel file exports these
- **runtime/**: `SettingsServiceLive` and `LockfileServiceLive` removed from shared layer composition
- **Command handlers**: `init`, `skills/install` (including `install-skill.ts`), `skills/fork`, `skills/list`, `skills/uninstall` (including `uninstall-skill.ts`) updated to use `Workspace` instead of `SettingsService`/`LockfileService`
- **sources/parser.ts**: Updated to use `Workspace.getLockedSkills()` instead of `LockfileService.getSkills()`
- **Tests**: Handler tests, workspace tests, and service tests updated to reflect new access patterns
