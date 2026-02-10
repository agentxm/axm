## MODIFIED Requirements

### Requirement: Mutations are serialized with concurrency protection

The settings service mutations SHALL NOT manage their own concurrency. The workspace service owns the semaphore that serializes all settings mutations. Settings service mutation methods (`addSkill`, `removeSkill`, `addAgent`) SHALL perform their read-modify-write logic without acquiring a semaphore, relying on the caller (workspace) to ensure serialization.

#### Scenario: Concurrent mutations

- **WHEN** multiple fibers invoke mutation methods (`addSkill`, `removeSkill`, `addAgent`) concurrently
- **THEN** each mutation completes in sequence because the workspace service's single semaphore serializes all workspace state mutations (settings and lockfile)

### Requirement: Settings service is injectable via Effect layers

The settings service SHALL be provided internally by the workspace module's layer. It SHALL NOT be provided in the shared runtime layer or exported from the settings barrel file.

#### Scenario: Production layer

- **WHEN** the CLI runtime is composed
- **THEN** `SettingsService` is NOT included in the shared runtime layer
- **AND** `SettingsService` is provided internally within the workspace layer

#### Scenario: Test layer

- **WHEN** a test needs to control settings behavior
- **THEN** the test provides a mock `Workspace` via `Layer.succeed` which handles all settings operations
- **OR** the test imports `SettingsService` directly from the settings module file (not barrel) for unit-testing the internal implementation

### Requirement: Settings service is internal to workspace module

The settings service SHALL be documented as an internal implementation detail of the workspace module. It SHALL NOT be exported from the settings barrel file (`settings/index.ts`).

#### Scenario: Barrel file exports

- **WHEN** a consumer imports from the settings barrel (`@/settings` or `settings/index.ts`)
- **THEN** `SettingsService`, `SettingsServiceLive`, and `SettingsServiceInterface` SHALL NOT be available
- **AND** schemas, types, error classes, and I/O functions (`readSettings`, `writeSettings`, etc.) SHALL remain available

#### Scenario: Internal documentation

- **WHEN** reading the settings service source file
- **THEN** a doc comment SHALL indicate the service is internal to the workspace module and must not be accessed directly by command handlers

## REMOVED Requirements

### Requirement: Settings service provides getSources query

**Reason**: Source operations (`getSources`, `getSourceByName`, `getRegistrySources`, `addSource`) are already implemented directly on the workspace service and were never actually routed through `SettingsService`. Removing these from the settings-service spec to reflect reality.

**Migration**: Use `Workspace.getSources()`, `Workspace.getSourceByName()`, `Workspace.getRegistrySources()`, `Workspace.addSource()` (no change — these already exist on workspace).

### Requirement: Settings service provides getSourceByName query

**Reason**: Already implemented on workspace service, not settings service.

**Migration**: Use `Workspace.getSourceByName()`.

### Requirement: Settings service provides getRegistrySources query

**Reason**: Already implemented on workspace service, not settings service.

**Migration**: Use `Workspace.getRegistrySources()`.

### Requirement: Settings service provides addSource mutation

**Reason**: Already implemented on workspace service, not settings service.

**Migration**: Use `Workspace.addSource()`.

### Requirement: Settings schema evolves sources field

**Reason**: This describes the schema format, not a settings service behavior. The schema itself (`SettingsSchema`) remains exported from the settings module — this requirement was incorrectly scoped to the service spec.

**Migration**: No change needed. Schema validation is unchanged.
