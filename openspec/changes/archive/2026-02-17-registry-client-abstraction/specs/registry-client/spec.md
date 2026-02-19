## ADDED Requirements

### Requirement: RegistryClient interface

The system SHALL provide a `RegistryClient` interface with 6 methods for operating against a registry layout. A `RegistryClient` is scoped to a specific registry root at construction time.

Methods:

- `getExtensions(options: RegistrySearchOptions)` — discover extensions matching search criteria
- `namespaceExists(scope)` — check if a scope directory exists
- `fetchIndex(scope, type, name)` — read and validate the extension's `index.json`
- `getExtension(scope, type, name, version)` — read raw archive bytes for a version
- `publishExtension(scope, type, name, version, archive, metadata)` — write archive and update index
- `extensionExists(scope, type, name)` — check if an extension's `index.json` exists

#### Scenario: Client scoped to registry root

- **WHEN** `createRegistryClient("/registries/main")` is called
- **THEN** all subsequent method calls operate against `/registries/main` as the registry root

#### Scenario: getExtensions discovers matching extensions

- **WHEN** `getExtensions({ names: ["@acme/code-review"], agents: [], type: "skill" })` is called
- **THEN** the client scans the registry layout, reads index files, applies version/agent filtering, and returns matching `RegistryExtensionEntry` results

#### Scenario: namespaceExists checks scope directory

- **WHEN** `namespaceExists("@acme")` is called and the scope directory exists
- **THEN** it returns `true`

#### Scenario: fetchIndex reads and validates index.json

- **WHEN** `fetchIndex("@acme", "skill", "code-review")` is called
- **THEN** it reads `<root>/extensions/@acme/skills/code-review/index.json` and returns a validated `ExtensionIndex`

#### Scenario: getExtension reads archive bytes

- **WHEN** `getExtension("@acme", "skill", "code-review", "1.0.0")` is called
- **THEN** it reads `<root>/extensions/@acme/skills/code-review/1.0.0.zip` and returns the raw `Uint8Array`

#### Scenario: extensionExists checks for index.json

- **WHEN** `extensionExists("@acme", "skill", "code-review")` is called and the extension directory contains `index.json`
- **THEN** it returns `true`

### Requirement: RegistrySearchOptions type

The `RegistryClient` SHALL accept `RegistrySearchOptions` for search operations. This is a registry-domain type with no imports from `sources/`.

Fields:

- `names`: extension names to match (empty = all)
- `agents`: agent compatibility filter (empty = all)
- `type`: `RegistryExtensionType | "*"`

#### Scenario: Search options mirror FindOptions shape

- **WHEN** a host provider maps `FindOptions` to `RegistrySearchOptions`
- **THEN** the mapping is field-for-field with no data transformation needed

### Requirement: RegistryExtensionEntry type

The `RegistryClient` SHALL return `RegistryExtensionEntry` from `getExtensions`. This is a registry-domain type with no imports from `sources/`.

Fields:

- `scope`: registry scope (e.g., `"@acme"`)
- `type`: `RegistryExtensionType` (`"skill" | "mcp-server" | "pack"`)
- `name`: extension name
- `version`: resolved semver version string
- `checksum`: archive checksum in `sha256:<hex>` format

#### Scenario: Entry contains all fields needed for SourceExtensionRef mapping

- **WHEN** a host provider receives a `RegistryExtensionEntry`
- **THEN** it has sufficient data to construct a `SourceExtensionRef` with `RegistryRefDetails` (scope, version, checksum)

### Requirement: LocalRegistryClient implementation

The system SHALL implement `LocalRegistryClient` that performs all `RegistryClient` operations via filesystem I/O against the static-file registry layout.

#### Scenario: getExtensions scans scope directories

- **WHEN** `getExtensions` is called on a local registry at `/registries/main`
- **THEN** the client scans `@*` directories under `<root>/extensions/`, reads index files, and applies version/agent filtering

#### Scenario: publishExtension is idempotent for same version and checksum

- **WHEN** `publishExtension` is called for a version that already exists with the same checksum
- **THEN** the operation succeeds without modification (no-op)

#### Scenario: publishExtension fails on version conflict

- **WHEN** `publishExtension` is called for a version that already exists with a different checksum
- **THEN** the operation fails with a `CliError`

### Requirement: RemoteRegistryClient stub

The system SHALL implement `RemoteRegistryClient` that fails all operations with a descriptive error. This is a placeholder for future implementation.

#### Scenario: Any operation on remote client

- **WHEN** any method is called on `RemoteRegistryClient`
- **THEN** it fails with `CliError` containing "remote registry not yet supported"

### Requirement: RegistryClient factory

A factory function `createRegistryClient` SHALL create the appropriate client based on location scheme.

#### Scenario: Local path creates LocalRegistryClient

- **WHEN** the location is `/path/to/registry` or `file:///path/to/registry`
- **THEN** a `LocalRegistryClient` is created

#### Scenario: HTTPS URL creates RemoteRegistryClient

- **WHEN** the location is `https://registry.example.com`
- **THEN** a `RemoteRegistryClient` is created

## MODIFIED Requirements

### Requirement: Local registry source provider

The system SHALL implement a `LocalRegistryClient` that performs all registry operations via filesystem I/O against the static-file layout.

#### Scenario: Find reads index from filesystem

- **WHEN** `getExtensions` is called for `@acme/code-review` on a local registry at `/registries/main`
- **THEN** the client reads `/registries/main/extensions/@acme/skills/code-review/index.json`

#### Scenario: getExtension reads archive from filesystem

- **WHEN** `getExtension("@acme", "skill", "code-review", "1.0.0")` is called
- **THEN** the client reads `/registries/main/extensions/@acme/skills/code-review/1.0.0.zip`

#### Scenario: Extension not found in local registry

- **WHEN** `getExtensions` is called and the `index.json` file does not exist
- **THEN** the client returns an empty result (triggers fallthrough)

### Requirement: Remote registry source provider stub

The system SHALL implement a `RemoteRegistryClient` that fails all operations with a descriptive error. This is a placeholder for future implementation.

#### Scenario: Any operation on remote registry

- **WHEN** any method is called on `RemoteRegistryClient`
- **THEN** it fails with `CliError` containing "remote registry not yet supported"

### Requirement: Registry provider factory

A factory function `createRegistryClient` SHALL create the appropriate registry client based on location scheme.

#### Scenario: Local path creates local provider

- **WHEN** the location is `/path/to/registry` or `file:///path/to/registry`
- **THEN** a `LocalRegistryClient` is created

#### Scenario: HTTPS URL creates remote provider stub

- **WHEN** the location is `https://registry.example.com`
- **THEN** a `RemoteRegistryClient` is created

## REMOVED Requirements

### Requirement: Archive extraction

**Reason**: Archive extraction and integrity verification are materialization concerns that belong in the host provider, not the registry client. The `RegistryClient` returns raw archive bytes via `getExtension`; the host provider handles extraction.

**Migration**: Archive extraction logic moves to `LocalRegistrySourceHostProvider.fetch` and `RemoteRegistrySourceHostProvider.fetch`. The `extractZip` and `computeChecksum` helpers move to `registry/utils.ts` for shared use.
