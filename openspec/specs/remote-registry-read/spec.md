# remote-registry-read Specification

## Purpose

Defines remote registry read behaviors for profile existence checks, package retrieval, and profile list discovery through `RemoteRegistryClient`.

## Requirements

### Requirement: Remote profile existence check

The `RemoteRegistryClient.namespaceExists` method SHALL determine profile existence via the remote extensions API.

#### Scenario: Profile has published extensions

- **WHEN** `namespaceExists("@acme")` calls `GET /v1/extensions/@acme` and the response is `200` with one or more extensions
- **THEN** the method SHALL return `{ exists: true }`

#### Scenario: Profile has no published extensions

- **WHEN** `namespaceExists("@acme")` calls `GET /v1/extensions/@acme` and the response is `200` with an empty extensions array
- **THEN** the method SHALL return `{ exists: false }`

#### Scenario: Profile not found

- **WHEN** `namespaceExists("@missing")` calls `GET /v1/extensions/@missing` and the response is `404`
- **THEN** the method SHALL return `{ exists: false }`

#### Scenario: Profile check network failure

- **WHEN** the profile existence request fails due to transport error
- **THEN** the method SHALL fail with `AppError` code `REGISTRY_REMOTE_NAMESPACE_CHECK_NETWORK_ERROR`

### Requirement: Remote package retrieval

The `RemoteRegistryClient.getExtensionPackage` method SHALL fetch extension archives using remote index and archive endpoints.

#### Scenario: Explicit version package fetch

- **WHEN** `getExtensionPackage({ profile, type, name, version: Some("1.2.3") })` is called
- **THEN** the client SHALL read `GET /v1/extensions/{profile}/{type}/{name}`
- **AND** the client SHALL verify version `1.2.3` exists in the returned index
- **AND** the client SHALL download `GET /v1/extensions/{profile}/{type}/{name}/1.2.3/archive`
- **AND** the method SHALL return `{ archive: Uint8Array }`

#### Scenario: Latest version package fetch

- **WHEN** `getExtensionPackage({ profile, type, name, version: None })` is called
- **THEN** the client SHALL read `GET /v1/extensions/{profile}/{type}/{name}`
- **AND** the client SHALL select the first version entry from the index as latest
- **AND** the client SHALL download that version archive and return raw bytes

#### Scenario: Requested version missing from index

- **WHEN** an explicit requested version is not present in the remote index response
- **THEN** the method SHALL fail with `AppError` code `REGISTRY_REMOTE_VERSION_NOT_FOUND`

#### Scenario: Archive endpoint returns not found

- **WHEN** index resolution succeeds but archive download returns `404`
- **THEN** the method SHALL fail with `AppError` code `REGISTRY_REMOTE_PACKAGE_NOT_FOUND`

### Requirement: Remote profile list discovery

The `RemoteRegistryClient.getExtensionsByScope` method SHALL support list-mode discovery when `names` is empty.

#### Scenario: Profile list without type filter

- **WHEN** `getExtensionsByScope({ profile: "@acme", names: [], types: [] })` is called
- **THEN** the client SHALL call `GET /v1/extensions/@acme`
- **AND** each returned extension summary SHALL be hydrated via `GET /v1/extensions/{profile}/{type}/{name}`
- **AND** the method SHALL return `GetExtensionsByProfileResponse`

#### Scenario: Profile list with type filter

- **WHEN** `getExtensionsByScope({ profile: "@acme", names: [], types: ["skill", "pack"] })` is called
- **THEN** the client SHALL call `GET /v1/extensions/@acme/skills` and `GET /v1/extensions/@acme/packs`
- **AND** each returned extension summary SHALL be hydrated via index endpoint calls
- **AND** the method SHALL return only extensions for requested types

#### Scenario: Profile list pagination

- **WHEN** list-mode discovery returns N hydrated extensions and the caller passes `offset` and optional `limit`
- **THEN** the client SHALL apply `offset` and `limit` client-side to produce the returned slice
- **AND** `total` SHALL equal N before slicing

#### Scenario: List response schema mismatch

- **WHEN** remote list or index response JSON does not match expected schema
- **THEN** the method SHALL fail with `AppError` code `REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE`

### Requirement: Authentication error mapping for read operations

Remote registry read operations SHALL map 401 and 403 responses to auth-specific `AppError` codes.

#### Scenario: Unauthenticated read (401)

- **WHEN** any remote read operation (`getExtensionsByScope`, `getExtensionPackage`, `namespaceExists`, `extensionExists`) returns 401
- **THEN** the method SHALL fail with `AppError` code `AUTH_UNAUTHENTICATED`
- **AND** `howToFix` SHALL read "Run `axm login` to sign in."

#### Scenario: Unauthorized read (403)

- **WHEN** any remote read operation returns 403
- **THEN** the method SHALL fail with `AppError` code `AUTH_UNAUTHORIZED`
- **AND** `details` SHALL include any `required_scope` or `required_role` from the response body
- **AND** `howToFix` SHALL describe the missing permission

#### Scenario: Public read without auth succeeds

- **WHEN** a remote read operation targets a public extension and no auth token is available
- **AND** the server returns 200
- **THEN** the operation SHALL succeed normally
