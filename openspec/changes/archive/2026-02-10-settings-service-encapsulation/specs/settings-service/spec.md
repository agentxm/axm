## MODIFIED Requirements

### Requirement: Mutations are serialized with concurrency protection

The settings service mutations SHALL NOT manage their own concurrency. The workspace service owns the semaphore that serializes all settings mutations. Settings service mutation methods (`addSkill`, `removeSkill`, `addAgent`) SHALL perform their read-modify-write logic without acquiring a semaphore, relying on the caller (workspace) to ensure serialization.

#### Scenario: Concurrent mutations

- **WHEN** multiple fibers invoke mutation methods (`addSkill`, `removeSkill`, `addAgent`) concurrently
- **THEN** each mutation completes in sequence because the workspace service's single semaphore serializes all workspace state mutations (settings and lockfile)

### Requirement: Settings service is not provided in production layers

The settings service SHALL NOT be provided in the shared runtime layer or exported from the settings barrel file. Workspace uses settings I/O functions directly — there is no `SettingsService` instance in production.

#### Scenario: Production layer

- **WHEN** the CLI runtime is composed
- **THEN** `SettingsService` is NOT included in the shared runtime layer
- **AND** workspace calls settings I/O functions (`readSettings`, `writeSettings`, `modifyJsonFile`) directly

#### Scenario: Test layer

- **WHEN** a test needs to control settings behavior
- **THEN** the test provides a mock `Workspace` via `Layer.succeed` which handles all settings operations
- **OR** the test imports `SettingsService` directly from the settings module file (not barrel) for unit-testing the service in isolation

### Requirement: Settings service is not exported from barrel

The settings service SHALL NOT be exported from the settings barrel file (`settings/index.ts`). It is no longer used in production — workspace calls I/O functions directly.

#### Scenario: Barrel file exports

- **WHEN** a consumer imports from the settings barrel (`@/settings` or `settings/index.ts`)
- **THEN** `SettingsService`, `SettingsServiceLive`, and `SettingsServiceInterface` SHALL NOT be available
- **AND** schemas, types, error classes, and I/O functions (`readSettings`, `writeSettings`, `modifyJsonFile`, etc.) SHALL remain available

#### Scenario: Service documentation

- **WHEN** reading the settings service source file
- **THEN** a doc comment SHALL indicate the service is not used in production and workspace calls I/O functions directly

## REMOVED Requirements

### Requirement: Settings service provides getSources query

**Reason**: Source operations (`getSources`, `getSourceByName`, `getRegistrySources`, `addSource`) are already implemented directly on the workspace service and were never routed through `SettingsService`. The current settings-service spec incorrectly lists these as settings-service requirements — they were always workspace-owned in the implementation. Removing to align the spec with reality.

**Migration**: Use `Workspace.getConfiguredSources()`, `Workspace.getConfiguredSourceByName()`, `Workspace.getConfiguredRegistrySources()`, `Workspace.addConfiguredSource()` (no change — these already exist on workspace, renamed to follow naming convention).

### Requirement: Settings service provides getSourceByName query

**Reason**: Already implemented on workspace service, not settings service.

**Migration**: Use `Workspace.getConfiguredSourceByName()`.

### Requirement: Settings service provides getRegistrySources query

**Reason**: Already implemented on workspace service, not settings service.

**Migration**: Use `Workspace.getConfiguredRegistrySources()`.

### Requirement: Settings service provides addSource mutation

**Reason**: Already implemented on workspace service, not settings service.

**Migration**: Use `Workspace.addConfiguredSource()`.

### Requirement: Settings schema evolves sources field

**Reason**: This describes the schema format, not a settings service behavior. The schema itself (`SettingsSchema`) remains exported from the settings module — this requirement was incorrectly scoped to the service spec.

**Migration**: No change needed. Schema validation is unchanged.
