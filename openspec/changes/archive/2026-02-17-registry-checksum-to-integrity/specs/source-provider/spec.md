## MODIFIED Requirements

### Requirement: ExtensionRef carries source and version metadata

`SourceExtensionRef` SHALL be a two-dimensional discriminated union (extension type x source type). Each ref variant carries a full `Source` object (not a `SourceType` string) and source-specific ref details.

- Git-hosted refs carry `location` (file:// URL) and `gitTreeSha: Option<string>`
- Registry refs carry `version: string` and `integrity: string`
- Local refs carry `location` (file:// URL)
- Builtin refs carry no additional fields

#### Scenario: Git-sourced ref has location and tree SHA

- **WHEN** `find` returns a ref from a GitHub source
- **THEN** it is a `GitHubSkillRef` with `location` (file:// URL to temp clone directory) and `gitTreeSha`

#### Scenario: Registry-sourced ref has version and integrity

- **WHEN** `find` returns a ref from a registry source
- **THEN** it is a `RegistrySkillRef` with `version` (resolved semver) and `integrity` (from registry index)

#### Scenario: Location is always populated after find

- **WHEN** `find` returns any ref
- **THEN** `location` is populated (providers materialize files before returning refs)

### Requirement: Registry provider populates integrity during discovery

The registry provider's `find()` SHALL return `SourceExtensionRef` with `integrity` populated from the registry index metadata. Integrity is an intrinsic property of a registry ref known at discovery time.

#### Scenario: Registry find includes integrity

- **WHEN** the registry provider's `find()` discovers an extension
- **THEN** the returned `RegistrySkillRef` has a non-empty `integrity` field from the registry index

### Requirement: LocalRegistrySourceHostProvider

The system SHALL implement `LocalRegistrySourceHostProvider` as a `PublishableSourceHostProvider` that delegates to a `LocalRegistryClient`. It maps between source-domain types and registry-domain types at the boundary.

#### Scenario: find maps FindOptions to RegistrySearchOptions

- **WHEN** `find(source, options)` is called with `FindOptions`
- **THEN** the provider maps `FindOptions` to `RegistrySearchOptions`, calls `client.getExtensions(searchOptions)`, and maps each `RegistryExtensionEntry` to a `SourceExtensionRef` stamped with the `source` and `RegistryRefDetails`

#### Scenario: fetch extracts scope from ref and delegates to client

- **WHEN** `fetch(source, ref)` is called with a registry-sourced ref
- **THEN** the provider extracts `scope`, `type`, `name`, `version` from the ref's `RegistryRefDetails`, calls `client.getExtension(scope, type, name, version)` to get archive bytes, verifies the SHA-512 integrity, and extracts the zip archive to a temporary directory

#### Scenario: publishExtension delegates to client

- **WHEN** `publishExtension(scope, type, name, version, archive, metadata)` is called
- **THEN** the provider delegates directly to `client.publishExtension(...)` with the same arguments

### Requirement: Operation args take SourceExtensionRef directly

`InstallSkillOperationArgs` SHALL take a `SkillExtensionRef` instead of flat fields extracted from the ref. `CopySkillOperationArgs` SHALL similarly take a `SkillExtensionRef`. Lock-entry conversion switches on `ref.source.type` and pulls all fields from the ref.

#### Scenario: Install args simplified to ref plus operational params

- **WHEN** constructing `InstallSkillOperationArgs`
- **THEN** the args contain `ref: SkillExtensionRef`, `agents`, `force`, and optional `skipSettings`

#### Scenario: Copy args simplified to ref plus target name

- **WHEN** constructing `CopySkillOperationArgs`
- **THEN** the args contain `ref: SkillExtensionRef` and `targetName`

#### Scenario: Lock entry conversion uses ref source type

- **WHEN** `sourceToLockEntry` converts a `SkillExtensionRef` to a lock entry
- **THEN** it switches on `ref.source.type` to extract source-specific fields (version, integrity, gitTreeSha, location)

## RENAMED Requirements

### Requirement: Registry provider populates checksum during discovery

FROM: Registry provider populates checksum during discovery
TO: Registry provider populates integrity during discovery
