# cli-auth-middleware Specification

## Purpose

Credential-based auth header injection with scoped ambient tokens for outgoing HTTP requests.

## Requirements

### Requirement: Token resolution precedence

The auth middleware SHALL resolve tokens through two mechanisms: stored credentials (any origin) and ambient tokens (default registry only).

#### Scenario: Stored credentials for any registry

- **WHEN** a request targets an origin that has stored credentials in the credential store
- **THEN** the middleware SHALL use the stored access token
- **AND** preflight expiry check and automatic refresh apply as before

#### Scenario: AXM_TOKEN scoped to default registry

- **WHEN** `AXM_TOKEN` is set and the request targets the default registry origin
- **AND** no stored credentials exist for that origin
- **THEN** the middleware SHALL use the env var value as the Bearer token

#### Scenario: AXM_TOKEN not applied to non-registry hosts

- **WHEN** `AXM_TOKEN` is set and the request targets a non-registry host (e.g., github.com)
- **THEN** the middleware SHALL NOT inject the env var token

#### Scenario: --token flag scoped to default registry

- **WHEN** a `--token` flag value is available and the request targets the default registry origin
- **AND** no stored credentials exist for that origin
- **THEN** the middleware SHALL use the flag value as the Bearer token

#### Scenario: AXM_TOKEN works without axm login

- **WHEN** `AXM_TOKEN` is set, the credential store is empty, and the request targets the default registry
- **THEN** the middleware SHALL use the env var token
- **AND** this SHALL preserve current CI pipeline behavior

### Requirement: Preflight expiry check

Before sending an authenticated request, the middleware SHALL check if the stored token is expired or near-expiry.

#### Scenario: Token within 5-minute expiry window

- **WHEN** the stored token's `expires_at` is within 5 minutes of the current time
- **THEN** the middleware SHALL attempt a proactive refresh via `POST /v1/auth/token/refresh` before sending the request
- **AND** on refresh success, use the new token for the request

#### Scenario: Token clearly valid

- **WHEN** the stored token's `expires_at` is more than 5 minutes in the future
- **THEN** the middleware SHALL use the token directly without attempting refresh

#### Scenario: Proactive refresh fails

- **WHEN** proactive refresh fails (network error, invalid refresh token)
- **THEN** the middleware SHALL still attempt the request with the current (possibly expired) token
- **AND** let the server's 401 response trigger the reactive refresh path

### Requirement: Bearer header injection

The middleware SHALL inject `Authorization: Bearer <token>` into outgoing HTTP requests.

#### Scenario: Token available

- **WHEN** a token is resolved from the precedence chain
- **THEN** the outgoing request SHALL include header `Authorization: Bearer <token>`

#### Scenario: No token available

- **WHEN** no token is resolved
- **THEN** the outgoing request SHALL NOT include an Authorization header

### Requirement: Automatic refresh on 401

When a request returns 401, the middleware SHALL attempt one token refresh cycle.

#### Scenario: Refresh succeeds and request retried

- **WHEN** a request returns 401 and the token source is the credential store
- **THEN** the middleware SHALL call `POST /v1/auth/token/refresh` with the refresh token
- **AND** on success, persist the new credentials
- **AND** retry the original request once with the new token

#### Scenario: Refresh fails

- **WHEN** a request returns 401 and the refresh attempt also fails
- **THEN** the middleware SHALL return the original 401 response
- **AND** the caller SHALL receive a `AppError` with code `AUTH_UNAUTHENTICATED`
- **AND** `howToFix` SHALL read "Session expired. Run `axm login` to re-authenticate."

#### Scenario: No refresh for env var or flag tokens

- **WHEN** a request returns 401 and the token source is `AXM_TOKEN` or `--token`
- **THEN** the middleware SHALL NOT attempt refresh
- **AND** the 401 SHALL propagate directly to the caller

#### Scenario: Single retry only

- **WHEN** the retried request after refresh also returns 401
- **THEN** the middleware SHALL NOT attempt another refresh
- **AND** SHALL return the 401 response

### Requirement: Token refresh credential persistence

When a refresh succeeds, the middleware SHALL persist the new credentials.

#### Scenario: Refresh updates credential store

- **WHEN** `POST /v1/auth/token/refresh` returns new `access_token`, `refresh_token`, and `expires_at`
- **THEN** the middleware SHALL call `CredentialStore.save()` with the new credentials
- **AND** the old refresh token SHALL no longer be used (one-time-use per server policy)

### Requirement: Non-registry requests pass through

The auth middleware SHALL determine whether to inject auth headers based on credential availability, not URL matching against a hardcoded registry.

#### Scenario: Request to origin with stored credentials

- **WHEN** the request URL's origin matches a key in the credential store
- **THEN** auth headers SHALL be injected per the stored credentials

#### Scenario: Request to default registry with ambient token

- **WHEN** the request URL's origin matches the default registry origin
- **AND** no stored credentials exist but `AXM_TOKEN` or `--token` is available
- **THEN** auth headers SHALL be injected using the ambient token

#### Scenario: Request to unknown origin without credentials

- **WHEN** the request URL's origin has no stored credentials and is not the default registry
- **THEN** the request SHALL pass through without modification

#### Scenario: Stored credentials take precedence over ambient tokens

- **WHEN** the request targets the default registry origin
- **AND** both stored credentials and `AXM_TOKEN` are available
- **THEN** the middleware SHALL use the stored credentials (existing precedence: env > flag > store is preserved within `resolveToken` for backward compat, but stored credentials from `resolveStoredToken` are checked first in the middleware)

### Requirement: Token resolution split

Token resolution SHALL be split into two functions with distinct scoping.

#### Scenario: resolveStoredToken looks up by origin

- **WHEN** `resolveStoredToken(origin)` is called
- **THEN** it SHALL return stored credentials for that origin from the credential store
- **AND** it SHALL NOT check `AXM_TOKEN` or `--token` flag

#### Scenario: resolveAmbientToken checks env and flag only

- **WHEN** `resolveAmbientToken(flagToken)` is called
- **THEN** it SHALL check `AXM_TOKEN` env var first, then `--token` flag
- **AND** it SHALL NOT access the credential store

#### Scenario: resolveToken preserved for backward compatibility

- **WHEN** `resolveToken(registryUrl, flagToken)` is called (by withAuthGuard or auth commands)
- **THEN** it SHALL compose ambient + stored resolution with the existing precedence chain
