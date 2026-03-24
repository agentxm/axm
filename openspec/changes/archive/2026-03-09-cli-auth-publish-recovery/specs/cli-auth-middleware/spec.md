# cli-auth-middleware Specification

## Purpose

HTTP auth middleware — token resolution precedence, preflight expiry check, automatic refresh, and Bearer header injection.

## ADDED Requirements

### Requirement: Token resolution precedence

The auth middleware SHALL resolve tokens from a defined precedence chain before each authenticated request.

#### Scenario: AXM_TOKEN env var takes priority

- **WHEN** the `AXM_TOKEN` environment variable is set
- **THEN** the middleware SHALL use its value as the Bearer token
- **AND** print "Authenticating via AXM_TOKEN environment variable" to stderr (once per CLI invocation)

#### Scenario: --token flag second priority

- **WHEN** `AXM_TOKEN` is not set and a `--token` flag value is available
- **THEN** the middleware SHALL use the flag value as the Bearer token

#### Scenario: Credential store third priority

- **WHEN** neither env var nor flag is set and `CredentialStore.load(registryUrl)` returns credentials
- **THEN** the middleware SHALL use the stored access token

#### Scenario: No token available

- **WHEN** no token is resolvable from any source
- **THEN** the middleware SHALL send the request without an Authorization header
- **AND** downstream 401 responses SHALL propagate to the caller

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
- **AND** the caller SHALL receive an `AppError` with code `AUTH_UNAUTHENTICATED`
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

The auth middleware SHALL only inject auth headers for requests to the configured registry URL.

#### Scenario: Registry URL request

- **WHEN** the request URL starts with the configured registry base URL
- **THEN** auth headers SHALL be injected per the precedence chain

#### Scenario: Non-registry URL request

- **WHEN** the request URL does not match the configured registry base URL
- **THEN** the request SHALL pass through without modification
