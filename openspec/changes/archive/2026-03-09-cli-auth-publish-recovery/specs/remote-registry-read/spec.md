# remote-registry-read Delta Specification

## Purpose

Add auth-specific error handling for 401/403 responses to remote read operations.

## ADDED Requirements

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
