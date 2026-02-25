# registry-client Specification

## Purpose

Provides a `RegistryClient` interface for version resolution, integrity verification, and extension discovery/retrieval against registry layouts.

## Requirements

### Requirement: RegistryClient interface

The system SHALL provide a `RegistryClient` interface with 6 methods for operating against a registry layout. A `RegistryClient` is scoped to a specific registry root at construction time.

Methods:

- `getExtensions(options: RegistrySearchOptions)` — discover extensions matching search criteria
- `namespaceExists(namespace)` — check if a namespace directory exists
- `fetchIndex(namespace, type, name)` — read and validate the extension's `index.json`
- `getExtension(namespace, type, name, version)` — read raw archive bytes for a version
- `publishExtension(namespace, type, name, version, archive, metadata)` — write archive and update index
- `extensionExists(namespace, type, name)` — check if an extension's `index.json` exists

#### Scenario: Client scoped to registry root

- **WHEN** `createRegistryClient("/registries/main")` is called
- **THEN** all subsequent method calls operate against `/registries/main` as the registry root

#### Scenario: getExtensions discovers matching extensions

- **WHEN** `getExtensions({ names: ["@acme/code-review"], agents: [], type: "skill" })` is called
- **THEN** the client scans the registry layout, reads index files, applies version/agent filtering, and returns matching `RegistryExtensionEntry` results

#### Scenario: namespaceExists checks namespace directory

- **WHEN** `namespaceExists("@acme")` is called and the namespace directory exists
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

- `namespace`: registry namespace (e.g., `"@acme"`)
- `type`: `RegistryExtensionType` (`"skill" | "mcp-server" | "pack"`)
- `name`: extension name
- `version`: resolved semver version string
- `integrity`: archive integrity in SRI format (`sha512-<base64>`)

#### Scenario: Entry contains all fields needed for SourceExtensionRef mapping

- **WHEN** a host provider receives a `RegistryExtensionEntry`
- **THEN** it has sufficient data to construct a `SourceExtensionRef` with `RegistryRefDetails` (namespace, version, integrity)

### Requirement: Version resolution by semver range

The registry client SHALL select a version from `index.json` by matching against a semver range using `semver.satisfies()` from the `semver` npm package.

#### Scenario: Exact version match

- **WHEN** resolving `@acme/tool@1.2.3` and `index.json` contains version `1.2.3`
- **THEN** version `1.2.3` is selected

#### Scenario: Range match selects newest satisfying version

- **WHEN** resolving `@acme/tool@^1.0.0` and `index.json` contains versions `1.2.3`, `1.1.0`, `1.0.0`, `0.9.0`
- **THEN** version `1.2.3` is selected (newest satisfying `^1.0.0`)

#### Scenario: No version specified resolves latest

- **WHEN** resolving `@acme/tool` with no version constraint
- **THEN** the newest version in `index.json` is selected (wildcard `*` match)

#### Scenario: No satisfying version returns 404

- **WHEN** resolving `@acme/tool@^2.0.0` and no versions satisfy the range
- **THEN** resolution returns 404 (triggers fallthrough to next registry source)

#### Scenario: Invalid version constraint rejected

- **WHEN** resolving with a version constraint that `semver.validRange()` returns null for
- **THEN** resolution SHALL fail with a CliError indicating the version constraint is invalid

#### Scenario: Version constraint passed to selectVersion

- **WHEN** the registry provider resolves an extension with a version constraint
- **THEN** the constraint SHALL be passed to `selectVersion` which filters candidates using `semver.satisfies(version, constraint)` in addition to the existing agent compatibility filter

### Requirement: Agent compatibility filter

The registry client SHALL filter versions by agent compatibility when an agents filter is provided.

#### Scenario: Agent filter matches

- **WHEN** resolving with `agents: ["claude-code"]` and version `1.0.0` has `agents: ["claude-code", "cursor"]`
- **THEN** version `1.0.0` is a candidate (at least one agent matches)

#### Scenario: Agent filter excludes

- **WHEN** resolving with `agents: ["claude-code"]` and version `1.0.0` has `agents: ["cursor"]`
- **THEN** version `1.0.0` is skipped

#### Scenario: Empty agents filter matches all

- **WHEN** resolving with `agents: []`
- **THEN** all versions are candidates regardless of their agents field

### Requirement: SHA-512 integrity verification

The registry client SHALL verify archive integrity using SHA-512 in SRI format.

#### Scenario: Integrity matches

- **WHEN** fetching an archive whose SHA-512 hash matches the `integrity` field in `index.json`
- **THEN** extraction proceeds normally

#### Scenario: Integrity mismatch

- **WHEN** fetching an archive whose SHA-512 hash does not match the `integrity` field
- **THEN** the operation fails with `CliError` indicating integrity verification failure

#### Scenario: Integrity format

- **WHEN** an integrity value is stored or compared
- **THEN** it uses SRI format `sha512-<base64>` (standard base64 encoding)

### Requirement: LocalRegistryClient implementation

The system SHALL implement `LocalRegistryClient` that performs all `RegistryClient` operations via filesystem I/O against the static-file registry layout.

#### Scenario: getExtensions scans namespace directories

- **WHEN** `getExtensions` is called on a local registry at `/registries/main`
- **THEN** the client scans `@*` directories under `<root>/extensions/`, reads index files, and applies version/agent filtering

#### Scenario: getExtensions reads index from filesystem

- **WHEN** `getExtensions` is called for `@acme/code-review` on a local registry at `/registries/main`
- **THEN** the client reads `/registries/main/extensions/@acme/skills/code-review/index.json`

#### Scenario: getExtension reads archive from filesystem

- **WHEN** `getExtension("@acme", "skill", "code-review", "1.0.0")` is called
- **THEN** the client reads `/registries/main/extensions/@acme/skills/code-review/1.0.0.zip`

#### Scenario: Extension not found in local registry

- **WHEN** `getExtensions` is called and the `index.json` file does not exist
- **THEN** the client returns an empty result (triggers fallthrough)

#### Scenario: publishExtension is idempotent for same version and integrity

- **WHEN** `publishExtension` is called for a version that already exists with the same integrity
- **THEN** the operation succeeds without modification (no-op)

#### Scenario: publishExtension fails on version conflict

- **WHEN** `publishExtension` is called for a version that already exists with a different integrity
- **THEN** the operation fails with a `CliError`

### Requirement: RemoteRegistryClient stub

The system SHALL implement `RemoteRegistryClient` with a real `publishExtension` method that sends HTTPS requests to the remote registry API. All other operations (`getExtensionsByScope`, `getExtensionPackage`, `namespaceExists`, `extensionExists`) SHALL fail with a descriptive "remote registry not yet supported" error.

#### Scenario: publishExtension sends HTTPS request

- **WHEN** `publishExtension` is called on a `RemoteRegistryClient`
- **THEN** it sends a multipart PUT request to the remote registry API
- **AND** returns `{ published: true }` on success

#### Scenario: Read operations remain unsupported

- **WHEN** `getExtensionsByScope`, `getExtensionPackage`, `namespaceExists`, or `extensionExists` is called on `RemoteRegistryClient`
- **THEN** it fails with `CliError` containing "remote registry not yet supported"

### Requirement: RegistryClient factory

A factory function `createRegistryClient` SHALL create the appropriate registry client based on location scheme. The factory SHALL pass the base URL and an `HttpClient` instance to the remote client constructor.

#### Scenario: Local path creates LocalRegistryClient

- **WHEN** the location is `/path/to/registry` or `file:///path/to/registry`
- **THEN** a `LocalRegistryClient` is created

#### Scenario: HTTPS URL creates RemoteRegistryClient

- **WHEN** the location is `https://registry.example.com`
- **THEN** a `RemoteRegistryClient` is created with the base URL and an `HttpClient` instance
