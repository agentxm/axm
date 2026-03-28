## MODIFIED Requirements

### Requirement: Auth business logic available from core

The `@axm.sh/core/unstable/auth` module SHALL export: `CredentialStore` (credential persistence service), `AuthClient` (OAuth device flow and token refresh via generated client), auth middleware (Effect HTTP client middleware for Bearer headers), `resolveToken` (token resolution chain), credential schemas, and `OAuthContract` types.

#### Scenario: CredentialStore importable from core

- **WHEN** a consumer imports `CredentialStore` from `@axm.sh/core/unstable/auth`
- **THEN** the service SHALL provide credential read, write, and delete operations

#### Scenario: AuthClient importable from core

- **WHEN** a consumer imports `AuthClient` from `@axm.sh/core/unstable/auth`
- **THEN** the client SHALL provide device authorization initiation and token polling/refresh
- **AND** SHALL use the generated registry client's auth operations for HTTP transport

#### Scenario: Token resolution importable from core

- **WHEN** a consumer imports `resolveToken` from `@axm.sh/core/unstable/auth`
- **THEN** it SHALL resolve tokens via the chain: explicit flag/env var, stored credentials (with refresh), then failure

#### Scenario: Auth middleware importable from core

- **WHEN** a consumer imports auth middleware from `@axm.sh/core/unstable/auth`
- **THEN** it SHALL provide Effect HTTP client middleware that adds Bearer authorization headers and handles token refresh on 401

### Requirement: AuthClientService interface uses construction-time registry URL

The `AuthClientService` interface SHALL accept the registry URL at construction time instead of as a per-call parameter, consistent with how `RegistryClient` is constructed.

#### Scenario: Registry URL removed from method signatures

- **WHEN** a consumer uses the `AuthClientService` interface
- **THEN** `initiateDeviceFlow` SHALL accept no arguments (previously accepted `registryUrl`)
- **AND** `pollDeviceToken` SHALL accept `(deviceCode, interval)` (previously accepted `(registryUrl, deviceCode, interval)`)
- **AND** `refreshToken` SHALL accept `(refreshTokenValue)` (previously accepted `(registryUrl, refreshTokenValue)`)
- **AND** `revokeToken` SHALL accept `(accessToken)` (previously accepted `(registryUrl, accessToken)`)
- **AND** `getMe` SHALL accept `(accessToken)` (previously accepted `(registryUrl, accessToken)`)

#### Scenario: Registry URL provided at layer construction

- **WHEN** the auth client layer is constructed
- **THEN** the `registryUrl` SHALL be provided as a construction-time parameter
- **AND** SHALL be used to configure the generated client's HttpClient via `mapRequest(prependUrl(registryUrl))`

#### Scenario: Callers updated to omit registry URL

- **WHEN** existing callers of `AuthClientService` methods are updated
- **THEN** they SHALL remove the `registryUrl` argument from all calls
- **AND** the registry URL SHALL already be baked into the service layer they depend on

### Requirement: Auth client uses generated schemas

The auth client SHALL import response schemas from the generated registry client instead of maintaining hand-written duplicates.

#### Scenario: Device flow response uses generated schema

- **WHEN** the auth client processes an `AuthIssueDeviceCode` response
- **THEN** it SHALL use the generated `AuthIssueDeviceCode200` type
- **AND** the hand-written `DeviceFlowResponseSchema` SHALL be removed

#### Scenario: Device token error uses generated schema

- **WHEN** the auth client processes a device token error response
- **THEN** it SHALL use the generated `AuthExchangeDeviceCode400` typed error
- **AND** the hand-written `DeviceTokenErrorSchema` SHALL be removed

#### Scenario: Me response uses generated schema

- **WHEN** the auth client processes an `AuthGetMe` response
- **THEN** it SHALL use the generated `AuthGetMe200` type
- **AND** SHALL transform it to the domain `MeResponse` type
- **AND** the hand-written `RegistryMeResponseSchema` SHALL be removed

#### Scenario: Token response uses generated schema

- **WHEN** the auth client processes token exchange or refresh responses
- **THEN** it SHALL use the generated `AuthExchangeDeviceCode200` / `AuthRefreshToken200` types
- **AND** SHALL normalize to the existing `TokenResponse` domain type

### Requirement: Auth module has no CLI imports

The `@axm.sh/core/unstable/auth` module SHALL only import from `effect/*` and `@axm.sh/core/unstable/*`.

#### Scenario: No CLI module imports

- **WHEN** inspecting all imports in the auth module source files
- **THEN** no import paths SHALL reference `@axm.sh/cli` or relative paths outside core
