# remote-registry-publish Delta Specification

## Purpose

Add auth-specific error mapping for 401/403 responses to remote publish operations.

## ADDED Requirements

### Requirement: Authentication error mapping for publish

The remote publish client SHALL map 401 and 403 responses to auth-specific `CliError` codes with recovery guidance.

#### Scenario: Unauthenticated publish (401)

- **WHEN** the publish request returns 401
- **THEN** the method SHALL fail with `CliError` code `AUTH_UNAUTHENTICATED`
- **AND** `howToFix` SHALL read "Session expired. Run `axm login` to re-authenticate."

#### Scenario: Unauthorized publish (403) with scope detail

- **WHEN** the publish request returns 403 with RFC 7807 body containing `required_scope` and `token_scopes`
- **THEN** the method SHALL fail with `CliError` code `AUTH_UNAUTHORIZED`
- **AND** `details` SHALL include the required scope, token scopes, and required role from the response
- **AND** `howToFix` SHALL describe the missing permission

#### Scenario: Unauthorized publish (403) quota exceeded preserved

- **WHEN** the publish request returns 403 with code `quota_exceeded`
- **THEN** the existing `REGISTRY_PUBLISH_QUOTA_EXCEEDED` mapping SHALL take priority over auth mapping
- **AND** the error SHALL NOT be mapped to `AUTH_UNAUTHORIZED`

#### Scenario: 401 includes WWW-Authenticate header context

- **WHEN** the publish request returns 401 with a `WWW-Authenticate` header
- **THEN** `details` SHALL include the `WWW-Authenticate` header value for diagnostics
