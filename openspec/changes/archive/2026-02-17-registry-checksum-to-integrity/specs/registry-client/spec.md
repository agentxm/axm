## MODIFIED Requirements

### Requirement: RegistryExtensionEntry type

The `RegistryClient` SHALL return `RegistryExtensionEntry` from `getExtensions`. This is a registry-domain type with no imports from `sources/`.

Fields:

- `scope`: registry scope (e.g., `"@acme"`)
- `type`: `RegistryExtensionType` (`"skill" | "mcp-server" | "pack"`)
- `name`: extension name
- `version`: resolved semver version string
- `integrity`: archive integrity in SRI format (`sha512-<base64>`)

#### Scenario: Entry contains all fields needed for SourceExtensionRef mapping

- **WHEN** a host provider receives a `RegistryExtensionEntry`
- **THEN** it has sufficient data to construct a `SourceExtensionRef` with `RegistryRefDetails` (scope, version, integrity)

### Requirement: SHA-512 integrity verification

The registry client SHALL verify archive integrity using SHA-512 in SRI format.

#### Scenario: Integrity matches

- **WHEN** fetching an archive whose SHA-512 hash matches the `integrity` field in `index.json`
- **THEN** extraction proceeds normally

#### Scenario: Integrity mismatch

- **WHEN** fetching an archive whose SHA-512 hash does not match the `integrity` field
- **THEN** the operation fails with `AppError` indicating integrity verification failure

#### Scenario: Integrity format

- **WHEN** an integrity value is stored or compared
- **THEN** it uses SRI format `sha512-<base64>` (standard base64 encoding)

### Requirement: LocalRegistryClient implementation

The system SHALL implement `LocalRegistryClient` that performs all `RegistryClient` operations via filesystem I/O against the static-file registry layout.

#### Scenario: getExtensions scans scope directories

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
- **THEN** the operation fails with an `AppError`

## RENAMED Requirements

### Requirement: SHA-256 integrity verification

FROM: SHA-256 integrity verification
TO: SHA-512 integrity verification
