## Why

The settings and lockfile services are currently exported publicly and consumed directly by command handlers, bypassing the workspace service. This creates multiple access paths to workspace state, making it difficult to enforce concurrency invariants and business logic centrally.

There are three independent semaphores today:

1. Settings service: serializes skill/agent mutations to `settings.json`
2. Workspace service: serializes `addSource` mutations to `settings.json`
3. Lockfile service: serializes lockfile mutations to `axm-lock.yaml`

Because install/uninstall operations span both files (add skill to settings AND update lockfile entry), concurrent operations can interleave writes across files. If one operation writes to settings while another writes to the lockfile, or if an operation succeeds on one file but fails on the other, the workspace ends up in an inconsistent state.

The workspace service should be the single owner of all workspace state mutations, with one semaphore serializing all writes to both settings and lockfile.

## What Changes

- **BREAKING**: Remove `SettingsService`, `SettingsServiceLive`, and `SettingsServiceInterface` from the `settings/` barrel export — make them internal to the workspace module
- **BREAKING**: Remove `LockfileService`, `LockfileServiceLive`, and `LockfileServiceInterface` from the `lockfile/` barrel export — make them internal to the workspace module
- **BREAKING**: Remove `SettingsServiceLive` and `LockfileServiceLive` from the shared runtime layer — provide them only internally within the workspace service layer
- Add skill and agent management methods to `Workspace` service interface, delegating to the internal settings service
- Add lockfile query and mutation methods to `Workspace` service interface, delegating to the internal lockfile service
- Consolidate to a single `Semaphore(1)` in workspace that serializes ALL state mutations across both files
- Add documentation comments to settings and lockfile services marking them as workspace-internal
- Add documentation comments to the workspace service indicating it manages all state read/write access
- Update all command handlers to use `Workspace` instead of `SettingsService`/`LockfileService`
- Update tests to reflect the new access pattern

## Capabilities

### New Capabilities

_None_ — this is an encapsulation refactor, not a new capability.

### Modified Capabilities

- `settings-service`: Requirements change — the service is no longer a public API; its interface is consumed only by the workspace module internally; semaphore removed (workspace owns serialization)
- `lockfile-service`: Requirements change — the service is no longer a public API; its interface is consumed only by the workspace module internally; semaphore removed (workspace owns serialization)
- `workspace-plan`: Requirements change — workspace service expands its interface to include skill, agent, and lockfile management methods; single semaphore serializes all mutations across both files

## Impact

- **settings/**: `service.ts` gets internal-only comments, semaphore removed; barrel file (`index.ts`) stops exporting service, layer, and interface types
- **lockfile/**: `service.ts` gets internal-only comments, semaphore removed; barrel file (`index.ts`) stops exporting service, layer, and interface types
- **workspace/**: `service.ts` gains new methods (`getSkills`, `addSkill`, `removeSkill`, `getAgents`, `addAgent`, `getLockEntries`, `getLockEntry`, `updateLockEntry`, `removeLockEntry`); single semaphore covers all mutations; barrel file exports these
- **runtime/**: `SettingsServiceLive` and `LockfileServiceLive` removed from shared layer composition — provided internally to workspace layer instead
- **Command handlers**: `init`, `skills/install`, `skills/fork`, `skills/list`, `skills/uninstall` updated to use `Workspace` instead of `SettingsService`/`LockfileService`
- **sources/parser.ts**: Updated to use `Workspace` instead of `LockfileService`
- **Tests**: Handler tests, workspace tests, and service tests updated to reflect new access patterns
