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
