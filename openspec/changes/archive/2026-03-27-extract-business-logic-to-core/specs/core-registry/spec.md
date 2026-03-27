## ADDED Requirements

### Requirement: Registry client available from core

The `@axm.sh/core/unstable/registry` module SHALL export the `RegistryClient` interface, `LocalRegistryClient` implementation, `RemoteRegistryClient` implementation, and `createRegistryClient` factory function. All behavioral requirements from the existing `registry-client` spec SHALL be preserved.

#### Scenario: RegistryClient importable from core

- **WHEN** a consumer imports `RegistryClient` from `@axm.sh/core/unstable/registry`
- **THEN** the interface SHALL be available with all six methods: `getExtensions`, `namespaceExists`, `fetchIndex`, `getExtension`, `publishExtension`, `extensionExists`

#### Scenario: createRegistryClient factory importable from core

- **WHEN** a consumer imports `createRegistryClient` from `@axm.sh/core/unstable/registry`
- **THEN** it SHALL create `LocalRegistryClient` for local paths and `RemoteRegistryClient` for HTTPS URLs

#### Scenario: Registry module has no CLI imports

- **WHEN** inspecting the imports of `@axm.sh/core/unstable/registry`
- **THEN** it SHALL NOT import from any CLI module
- **AND** it SHALL only import from `effect/*` and `@axm.sh/core/unstable/*`

### Requirement: Registry schema types in core

The `@axm.sh/core/unstable/registry` module SHALL export registry schema types: `ExtensionIndex`, `VersionEntry`, and related types. These SHALL be importable without importing the full client.

#### Scenario: Schema types used independently

- **WHEN** a consumer needs `ExtensionIndex` or `VersionEntry` types
- **THEN** they SHALL be importable from `@axm.sh/core/unstable/registry`

### Requirement: Registry utilities in core

The `@axm.sh/core/unstable/registry` module SHALL export utility functions: `extractZip`, `selectVersion`, `pluralizeType`, and `extensionDir`.

#### Scenario: extractZip available from core

- **WHEN** a consumer imports `extractZip` from `@axm.sh/core/unstable/registry`
- **THEN** it SHALL accept archive bytes and extract to a target directory
