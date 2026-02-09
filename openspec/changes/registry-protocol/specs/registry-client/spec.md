## ADDED Requirements

### Requirement: Version resolution by semver range

The registry client SHALL select a version from `index.json` by matching against a semver range.

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

### Requirement: SHA-256 integrity verification

The registry client SHALL verify archive integrity using SHA-256 checksums.

#### Scenario: Checksum matches

- **WHEN** fetching an archive whose SHA-256 hash matches the `checksum` field in `index.json`
- **THEN** extraction proceeds normally

#### Scenario: Checksum mismatch

- **WHEN** fetching an archive whose SHA-256 hash does not match the `checksum` field
- **THEN** the operation fails with `SourceError` indicating integrity verification failure

#### Scenario: Checksum format

- **WHEN** a checksum is stored or compared
- **THEN** it uses the format `sha256:<hex>` (lowercase hex digits)

### Requirement: Archive extraction

The registry client SHALL extract zip archives to a temporary directory for installation.

#### Scenario: Successful extraction

- **WHEN** a verified archive is extracted
- **THEN** extension files appear at the root of the extraction directory (no nested subdirectory)

#### Scenario: Extraction path returned as ExtensionFiles

- **WHEN** `fetch` completes for a registry source
- **THEN** the returned `ExtensionFiles.directory` points to the extraction directory

### Requirement: Local registry source provider

The system SHALL implement a `LocalRegistrySourceProvider` that performs all registry operations via filesystem I/O against the static-file layout.

#### Scenario: Find reads index from filesystem

- **WHEN** `find` is called for `@acme/code-review` on a local registry at `/registries/main`
- **THEN** the provider reads `/registries/main/extensions/@acme/skills/code-review/index.json`

#### Scenario: Fetch reads archive from filesystem

- **WHEN** `fetch` is called for version `1.0.0` of `@acme/code-review`
- **THEN** the provider reads `/registries/main/extensions/@acme/skills/code-review/1.0.0.zip`

#### Scenario: Extension not found in local registry

- **WHEN** `find` is called and the `index.json` file does not exist
- **THEN** the provider returns 404 (empty result, triggers fallthrough)

### Requirement: Remote registry source provider stub

The system SHALL implement a `RemoteRegistrySourceProvider` that fails all operations with a descriptive error. This is a placeholder for future implementation.

#### Scenario: Any operation on remote registry

- **WHEN** any method is called on `RemoteRegistrySourceProvider`
- **THEN** it fails with `RegistryError` containing "remote registry not yet supported"

### Requirement: Registry provider factory

A factory function SHALL create the appropriate registry provider based on location scheme.

#### Scenario: Local path creates local provider

- **WHEN** the location is `/path/to/registry` or `file:///path/to/registry`
- **THEN** a `LocalRegistrySourceProvider` is created

#### Scenario: HTTPS URL creates remote provider stub

- **WHEN** the location is `https://registry.example.com`
- **THEN** a `RemoteRegistrySourceProvider` is created
