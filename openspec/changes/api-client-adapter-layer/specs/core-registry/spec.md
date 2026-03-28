## MODIFIED Requirements

### Requirement: Registry client available from core

The `@axm.sh/core/unstable/registry` module SHALL export the `RegistryClient` interface, `LocalRegistryClient` implementation, remote registry adapter, and `createRegistryClient` factory function. All behavioral requirements from the existing spec SHALL be preserved.

#### Scenario: RegistryClient importable from core

- **WHEN** a consumer imports `RegistryClient` from `@axm.sh/core/unstable/registry`
- **THEN** the interface SHALL be available with all six methods: `getExtensionsByScope`, `profileExists`, `getExtensionIndex`, `getExtensionPackage`, `publishExtension`, `extensionExists`

#### Scenario: createRegistryClient factory importable from core

- **WHEN** a consumer imports `createRegistryClient` from `@axm.sh/core/unstable/registry`
- **THEN** it SHALL create `LocalRegistryClient` for local paths and the remote registry adapter for HTTPS URLs

#### Scenario: Registry module has no CLI imports

- **WHEN** inspecting the imports of `@axm.sh/core/unstable/registry`
- **THEN** it SHALL NOT import from any CLI module
- **AND** it SHALL only import from `effect/*` and `@axm.sh/core/unstable/*`

#### Scenario: Remote registry uses adapter backed by generated client

- **WHEN** `createRegistryClient` is called with an HTTP/HTTPS URL
- **THEN** it SHALL construct the remote registry adapter via `createRemoteRegistryAdapter`
- **AND** the adapter SHALL use the generated `registry-client.ts` for all HTTP transport
- **AND** the hand-written `remote-client.ts` SHALL no longer exist

#### Scenario: Local registry client unchanged

- **WHEN** `createRegistryClient` is called with a local path or `file://` URL
- **THEN** it SHALL create `LocalRegistryClient` using filesystem operations
- **AND** the local client SHALL NOT be affected by the adapter change
