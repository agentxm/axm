## ADDED Requirements

### Requirement: Remote namespace existence check

The `RemoteRegistryClient.namespaceExists` method SHALL determine namespace existence via the remote extensions API.

#### Scenario: Namespace has published extensions

- **WHEN** `namespaceExists("@acme")` calls `GET /v1/extensions/@acme` and the response is `200` with one or more extensions
- **THEN** the method SHALL return `{ exists: true }`

#### Scenario: Namespace has no published extensions

- **WHEN** `namespaceExists("@acme")` calls `GET /v1/extensions/@acme` and the response is `200` with an empty extensions array
- **THEN** the method SHALL return `{ exists: false }`

#### Scenario: Namespace not found

- **WHEN** `namespaceExists("@missing")` calls `GET /v1/extensions/@missing` and the response is `404`
- **THEN** the method SHALL return `{ exists: false }`

#### Scenario: Namespace check network failure

- **WHEN** the namespace existence request fails due to transport error
- **THEN** the method SHALL fail with `AppError` code `REGISTRY_REMOTE_NAMESPACE_CHECK_NETWORK_ERROR`

### Requirement: Remote package retrieval

The `RemoteRegistryClient.getExtensionPackage` method SHALL fetch extension archives using remote index and archive endpoints.

#### Scenario: Explicit version package fetch

- **WHEN** `getExtensionPackage({ namespace, type, name, version: Some("1.2.3") })` is called
- **THEN** the client SHALL read `GET /v1/extensions/{namespace}/{type}/{name}`
- **AND** the client SHALL verify version `1.2.3` exists in the returned index
- **AND** the client SHALL download `GET /v1/extensions/{namespace}/{type}/{name}/1.2.3/archive`
- **AND** the method SHALL return `{ archive: Uint8Array }`

#### Scenario: Latest version package fetch

- **WHEN** `getExtensionPackage({ namespace, type, name, version: None })` is called
- **THEN** the client SHALL read `GET /v1/extensions/{namespace}/{type}/{name}`
- **AND** the client SHALL select the first version entry from the index as latest
- **AND** the client SHALL download that version archive and return raw bytes

#### Scenario: Requested version missing from index

- **WHEN** an explicit requested version is not present in the remote index response
- **THEN** the method SHALL fail with `AppError` code `REGISTRY_REMOTE_VERSION_NOT_FOUND`

#### Scenario: Archive endpoint returns not found

- **WHEN** index resolution succeeds but archive download returns `404`
- **THEN** the method SHALL fail with `AppError` code `REGISTRY_REMOTE_PACKAGE_NOT_FOUND`

### Requirement: Remote namespace list discovery

The `RemoteRegistryClient.getExtensionsByScope` method SHALL support list-mode discovery when `names` is empty.

#### Scenario: Namespace list without type filter

- **WHEN** `getExtensionsByScope({ namespace: "@acme", names: [], types: [] })` is called
- **THEN** the client SHALL call `GET /v1/extensions/@acme`
- **AND** each returned extension summary SHALL be hydrated via `GET /v1/extensions/{namespace}/{type}/{name}`
- **AND** the method SHALL return `GetExtensionsByNamespaceResponse`

#### Scenario: Namespace list with type filter

- **WHEN** `getExtensionsByScope({ namespace: "@acme", names: [], types: ["skill", "pack"] })` is called
- **THEN** the client SHALL call `GET /v1/extensions/@acme/skills` and `GET /v1/extensions/@acme/packs`
- **AND** each returned extension summary SHALL be hydrated via index endpoint calls
- **AND** the method SHALL return only extensions for requested types

#### Scenario: Namespace list pagination

- **WHEN** list-mode discovery returns N hydrated extensions and the caller passes `offset` and optional `limit`
- **THEN** the client SHALL apply `offset` and `limit` client-side to produce the returned slice
- **AND** `total` SHALL equal N before slicing

#### Scenario: List response schema mismatch

- **WHEN** remote list or index response JSON does not match expected schema
- **THEN** the method SHALL fail with `AppError` code `REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE`
