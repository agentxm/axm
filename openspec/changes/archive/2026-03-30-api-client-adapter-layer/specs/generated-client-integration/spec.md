## ADDED Requirements

### Requirement: Remote registry client uses generated client for transport

The remote registry client SHALL implement the `RegistryClient` interface by delegating HTTP transport to the generated registry client (`registry-client.ts`) and mapping all errors to `AppError` with per-operation error codes.

#### Scenario: Client constructed with base URL and HttpClient

- **WHEN** `createRemoteRegistryClient(baseUrl, httpClient)` is called
- **THEN** it SHALL construct the generated registry client with the HttpClient pre-configured via `HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl))`
- **AND** SHALL return an object implementing the `RegistryClient` interface

#### Scenario: getExtensionIndex delegates to ExtensionsGet

- **WHEN** `getExtensionIndex` is called with handle, type, and name
- **THEN** the implementation SHALL call the generated `ExtensionsGet` operation
- **AND** SHALL return `Option.some(ExtensionIndex)` on success
- **AND** SHALL return `Option.none()` when the generated client returns a 404 error

#### Scenario: getExtensionIndex maps network errors

- **WHEN** `getExtensionIndex` encounters an `HttpClientError`
- **THEN** the implementation SHALL fail with `AppError` code `REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR`
- **AND** SHALL include connection diagnostics via `buildNetworkHowToFix`

#### Scenario: getExtensionIndex maps auth errors

- **WHEN** `getExtensionIndex` encounters a 401 `RegistryClientError`
- **THEN** the implementation SHALL fail with `AppError` code `AUTH_UNAUTHENTICATED`
- **WHEN** `getExtensionIndex` encounters a 403 `RegistryClientError`
- **THEN** the implementation SHALL fail with `AppError` code `AUTH_UNAUTHORIZED` with required scope details

#### Scenario: getExtensionIndex maps decode errors

- **WHEN** `getExtensionIndex` encounters a `SchemaError`
- **THEN** the implementation SHALL fail with `AppError` code `REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE`

#### Scenario: getExtensionsByScope delegates to ExtensionsListByProfile and ExtensionsListByType

- **WHEN** `getExtensionsByScope` is called with handle, names, types, limit, and offset
- **THEN** the implementation SHALL call `ExtensionsListByProfile` when types is empty
- **AND** SHALL call `ExtensionsListByType` for each type when types is non-empty
- **AND** SHALL merge results, filter by names, and apply limit/offset

#### Scenario: getExtensionsByScope maps errors per-operation

- **WHEN** `getExtensionsByScope` encounters an `HttpClientError`
- **THEN** the implementation SHALL fail with `AppError` code `REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR`
- **WHEN** it encounters a `RegistryClientError` with status 401
- **THEN** the implementation SHALL fail with `AUTH_UNAUTHENTICATED`
- **WHEN** it encounters a `RegistryClientError` with status 403
- **THEN** the implementation SHALL fail with `AUTH_UNAUTHORIZED`
- **WHEN** it encounters any other `RegistryClientError`
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_DISCOVERY_FAILED`
- **WHEN** it encounters a `SchemaError`
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE`

#### Scenario: profileExists delegates to ExtensionsListByProfile

- **WHEN** `profileExists` is called with a handle
- **THEN** the implementation SHALL call the generated `ExtensionsListByProfile` operation
- **AND** SHALL return `{exists: false}` on 404
- **AND** SHALL return `{exists: true}` when the response contains extensions
- **AND** SHALL return `{exists: false}` when the response has zero extensions

#### Scenario: profileExists maps errors per-operation

- **WHEN** `profileExists` encounters an `HttpClientError`
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_NAMESPACE_CHECK_NETWORK_ERROR`
- **WHEN** it encounters an unexpected status
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_NAMESPACE_CHECK_FAILED`
- **WHEN** it encounters a `SchemaError`
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_INVALID_RESPONSE`

#### Scenario: getExtensionPackage uses two-step fetch

- **WHEN** `getExtensionPackage` is called with handle, type, name, and optional version
- **THEN** the implementation SHALL first call `ExtensionsGet` to fetch the extension index
- **AND** SHALL resolve the version (latest if `Option.none()`, specific if provided)
- **AND** SHALL then call `ExtensionsDownloadArchive` (non-streaming) to download the binary
- **AND** SHALL return `GetExtensionPackageResponse` with the `Uint8Array` archive

#### Scenario: getExtensionPackage maps errors per-operation

- **WHEN** `getExtensionPackage` encounters an `HttpClientError` on either step
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_PACKAGE_FETCH_NETWORK_ERROR`
- **WHEN** the index returns 404
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_PACKAGE_NOT_FOUND`
- **WHEN** the archive returns 404
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_PACKAGE_NOT_FOUND`
- **WHEN** the requested version is not found in the index
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_VERSION_NOT_FOUND`
- **WHEN** any other unexpected status is returned
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_PACKAGE_FETCH_FAILED`

#### Scenario: extensionExists delegates to ExtensionsHead

- **WHEN** `extensionExists` is called with handle, type, and name
- **THEN** the implementation SHALL call the generated `ExtensionsHead` operation
- **AND** SHALL return `{exists: true}` on 200
- **AND** SHALL return `{exists: false}` on 404

#### Scenario: extensionExists maps errors per-operation

- **WHEN** `extensionExists` encounters an `HttpClientError`
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_EXTENSION_CHECK_NETWORK_ERROR`
- **WHEN** it encounters a 401
- **THEN** the implementation SHALL fail with `AUTH_UNAUTHENTICATED`
- **WHEN** it encounters a 403
- **THEN** the implementation SHALL fail with `AUTH_UNAUTHORIZED`
- **WHEN** it encounters any other unexpected status
- **THEN** the implementation SHALL fail with `REGISTRY_REMOTE_EXTENSION_CHECK_FAILED`

#### Scenario: publishExtension delegates to ExtensionsPublishVersion

- **WHEN** `publishExtension` is called with handle, type, name, version, archive, and metadata
- **THEN** the implementation SHALL call the generated `ExtensionsPublishVersion` operation with multipart/form-data payload
- **AND** SHALL return `{published: true}` on 200 or 201

### Requirement: Remote registry client maps publish errors via typed RFC 9457 schemas

The remote registry client SHALL map `ExtensionsPublishVersion` error responses to specific `AppError` codes using the generated client's typed error schemas, replacing the hand-written `mapProblemDetailToAppError` raw JSON extraction.

#### Scenario: Publish conflict

- **WHEN** `publishExtension` encounters a 409 `RegistryClientError` with cause code `publish_conflict`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_CONFLICT`

#### Scenario: Invalid archive

- **WHEN** `publishExtension` encounters a 400 `RegistryClientError` with cause code `malformed_archive` or `empty_archive`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_INVALID_ARCHIVE`

#### Scenario: Archive too large

- **WHEN** `publishExtension` encounters a 413 `RegistryClientError` with cause code matching `ingest_*_too_large`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_TOO_LARGE`

#### Scenario: Unsupported content type

- **WHEN** `publishExtension` encounters a 415 `RegistryClientError` with cause code `ingest_unsupported_content_type`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_INVALID_ARCHIVE`

#### Scenario: Integrity mismatch

- **WHEN** `publishExtension` encounters a 422 `RegistryClientError` with cause code `integrity_mismatch`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_INTEGRITY_MISMATCH`

#### Scenario: Manifest validation failure

- **WHEN** `publishExtension` encounters a 422 `RegistryClientError` with cause code matching `manifest_*`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_MANIFEST_INVALID`

#### Scenario: Rate limited

- **WHEN** `publishExtension` encounters a 429 `RegistryClientError` with cause code `throttled`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_THROTTLED`
- **AND** SHALL include `retryAfterSeconds` in the howToFix message when available

#### Scenario: Quota exceeded

- **WHEN** `publishExtension` encounters a 403 `RegistryClientError` with cause code `quota_exceeded`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_QUOTA_EXCEEDED`

#### Scenario: Type not supported

- **WHEN** `publishExtension` encounters a 501 `RegistryClientError` with cause code `publish_type_not_implemented`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_TYPE_NOT_SUPPORTED`

#### Scenario: Publishing disabled

- **WHEN** `publishExtension` encounters a 503 `RegistryClientError` with cause code `publish_disabled`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_DISABLED`

#### Scenario: Publish auth errors

- **WHEN** `publishExtension` encounters a 401 `RegistryClientError`
- **THEN** the implementation SHALL fail with `AUTH_UNAUTHENTICATED`
- **WHEN** `publishExtension` encounters a 403 `RegistryClientError` without code `quota_exceeded`
- **THEN** the implementation SHALL fail with `AUTH_UNAUTHORIZED`

#### Scenario: Publish network error

- **WHEN** `publishExtension` encounters an `HttpClientError`
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_NETWORK_ERROR`
- **AND** SHALL include connection diagnostics

#### Scenario: Publish fallback error

- **WHEN** `publishExtension` encounters an unrecognized error status or code
- **THEN** the implementation SHALL fail with `REGISTRY_PUBLISH_FAILED`

### Requirement: Auth client uses generated registry client for transport

The auth client SHALL implement the `AuthClientService` interface by delegating HTTP transport to the generated registry client's auth operations. The `registryUrl` is provided at construction time, not per-call.

#### Scenario: AuthClientLive constructed with registry URL and HttpClient

- **WHEN** `AuthClientLive` is constructed with `registryUrl` and `httpClient`
- **THEN** it SHALL construct the generated registry client with the HttpClient pre-configured via `HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl))`
- **AND** SHALL return an object implementing the `AuthClientService` interface

#### Scenario: initiateDeviceFlow delegates to AuthIssueDeviceCode

- **WHEN** `initiateDeviceFlow()` is called
- **THEN** the client SHALL call the generated `AuthIssueDeviceCode` with `client_id` and `scope` as form-urlencoded payload
- **AND** SHALL return a `DeviceFlowResponse` on success

#### Scenario: initiateDeviceFlow maps errors

- **WHEN** `initiateDeviceFlow` encounters an `HttpClientError` or `RegistryClientError`
- **THEN** the client SHALL fail with `AUTH_LOGIN_FAILED` with registry URL context

#### Scenario: pollDeviceToken implements RFC 8628 polling loop

- **WHEN** `pollDeviceToken(deviceCode, interval)` is called
- **THEN** the client SHALL repeatedly call the generated `AuthExchangeDeviceCode` at the specified interval
- **AND** SHALL handle `authorization_pending` by continuing to poll
- **AND** SHALL handle `slow_down` by increasing the interval by 5 seconds
- **AND** SHALL return a `TokenResponse` when the exchange succeeds

#### Scenario: pollDeviceToken maps terminal errors

- **WHEN** the exchange returns cause code `access_denied`
- **THEN** the client SHALL fail with `AUTH_LOGIN_CANCELLED`
- **WHEN** the exchange returns cause code `expired_token`
- **THEN** the client SHALL fail with `AUTH_LOGIN_FAILED`

#### Scenario: refreshToken delegates to AuthRefreshToken

- **WHEN** `refreshToken(refreshTokenValue)` is called
- **THEN** the client SHALL call the generated `AuthRefreshToken` with form-urlencoded payload
- **AND** SHALL return a `TokenResponse` on success

#### Scenario: refreshToken maps errors

- **WHEN** `refreshToken` encounters any error
- **THEN** the client SHALL fail with `AUTH_REFRESH_FAILED`

#### Scenario: revokeToken delegates to AuthRevokeToken

- **WHEN** `revokeToken(accessToken)` is called
- **THEN** the client SHALL call the generated `AuthRevokeToken` with form-urlencoded payload
- **AND** SHALL swallow all errors (fire-and-forget)

#### Scenario: getMe delegates to AuthGetMe

- **WHEN** `getMe(accessToken)` is called
- **THEN** the client SHALL call the generated `AuthGetMe` operation
- **AND** SHALL transform the `AuthGetMe200` response to the domain `MeResponse` type

#### Scenario: getMe maps errors

- **WHEN** `getMe` encounters a 401 or 400
- **THEN** the client SHALL fail with `AUTH_UNAUTHENTICATED`
- **WHEN** `getMe` encounters a 500+
- **THEN** the client SHALL fail with `AUTH_SERVER_ERROR`

### Requirement: Telemetry client uses generated client for transport

`makeTelemetryClient` SHALL use the generated telemetry client as a thin HTTP transport layer. Metadata enrichment, mode gating, and fire-and-forget wrapping remain in `makeTelemetryClient`.

#### Scenario: Generated telemetry client constructed with HttpClient and base URL

- **WHEN** `makeTelemetryClient` constructs the transport layer with `httpClient` and `baseUrl`
- **THEN** it SHALL construct the generated telemetry client with the HttpClient pre-configured via `prependUrl(baseUrl)`

#### Scenario: Event ingestion delegates to EventsIngest

- **WHEN** `ingestEvents` is called with a fully-enriched event payload
- **THEN** the implementation SHALL call the generated `EventsIngest` operation
- **AND** SHALL wrap the call with `fireAndForget` (swallowFailure + forkDetach)

#### Scenario: Error ingestion delegates to ErrorsIngest

- **WHEN** `ingestErrors` is called with a fully-enriched error payload
- **THEN** the implementation SHALL call the generated `ErrorsIngest` operation
- **AND** SHALL wrap the call with `swallowFailure`

#### Scenario: All errors silently discarded

- **WHEN** the generated telemetry client returns any error (HttpClientError, SchemaError, TelemetryClientError)
- **THEN** the transport layer SHALL silently discard the error
- **AND** SHALL NOT propagate it to callers

### Requirement: Network diagnostics preserved

The remote registry client and auth client SHALL preserve the network diagnostic capabilities from the hand-written clients, including localhost+HTTPS detection and user-facing connection guidance.

#### Scenario: Localhost HTTPS mismatch detected

- **WHEN** a network error occurs and the base URL is a localhost address using HTTPS
- **THEN** the implementation SHALL include a diagnostic suggesting HTTP instead of HTTPS

#### Scenario: Network howToFix includes registry URL

- **WHEN** a network error occurs
- **THEN** the `howToFix` message SHALL include the registry URL to help the user diagnose connectivity

### Requirement: Shared error mapping helpers

The client implementations SHALL share common error mapping helpers for consistent `AppError` construction across registry and auth operations.

#### Scenario: Auth error helpers reusable

- **WHEN** a 401 `RegistryClientError` is encountered in any client implementation
- **THEN** `mapAuthUnauthenticated` SHALL extract WWW-Authenticate details and construct an `AUTH_UNAUTHENTICATED` AppError

#### Scenario: Authorization error helpers reusable

- **WHEN** a 403 `RegistryClientError` is encountered in any client implementation
- **THEN** `mapAuthUnauthorized` SHALL extract required_scope, token_scopes, and required_role from the typed cause and construct an `AUTH_UNAUTHORIZED` AppError
