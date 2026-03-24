# remote-registry-publish Specification

## Purpose

Defines remote extension publishing behavior over HTTPS, including request format and error mapping.

## Requirements

### Requirement: Remote publish via HTTPS

The `RemoteRegistryClient.publishExtension` SHALL send a `PUT` request to `{baseUrl}/v1/extensions/{profile}/{type}/{name}/{version}` with the archive and integrity as multipart/form-data.

#### Scenario: Successful first publish

- **WHEN** `publishExtension` is called with profile `@acme`, type `skill`, name `code-review`, version `1.0.0`, archive bytes, and metadata
- **THEN** a `PUT` request is sent to `{baseUrl}/v1/extensions/@acme/skill/code-review/1.0.0`
- **AND** the request body is multipart/form-data with an `archive` file part (application/zip) and an `integrity` text field
- **AND** the response status is 201
- **AND** the method returns `{ published: true }`

#### Scenario: Idempotent republish

- **WHEN** `publishExtension` is called for a version that already exists with the same integrity
- **THEN** the server responds with 200
- **AND** the method returns `{ published: true }`

#### Scenario: Integrity field sent from metadata

- **WHEN** `publishExtension` is called with metadata containing `integrity: "sha512-abc123..."`
- **THEN** the multipart request includes an `integrity` field with the SRI value

### Requirement: RFC 7807 error mapping

The remote client SHALL parse non-2xx responses as RFC 7807 problem detail JSON and map them to `AppError` with appropriate error codes and actionable `howToFix` guidance.

The problem detail response has the shape:

```
{ type, title, status, detail, code, requestId, retryable, retryAfterSeconds? }
```

#### Scenario: Version conflict (409)

- **WHEN** the server responds with 409 and code `publish_conflict`
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_CONFLICT`
- **AND** `howToFix` advises bumping the version

#### Scenario: Invalid archive (400)

- **WHEN** the server responds with 400 and code `malformed_archive` or `empty_archive`
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_INVALID_ARCHIVE`

#### Scenario: Archive too large (413)

- **WHEN** the server responds with 413
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_TOO_LARGE`
- **AND** `howToFix` advises reducing archive size

#### Scenario: Manifest validation failure (422)

- **WHEN** the server responds with 422 and a code matching `manifest_*`
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_MANIFEST_INVALID`

#### Scenario: Integrity mismatch (422)

- **WHEN** the server responds with 422 and code `integrity_mismatch`
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_INTEGRITY_MISMATCH`

#### Scenario: Rate limited (429)

- **WHEN** the server responds with 429 and code `throttled` with `retryAfterSeconds: 30`
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_THROTTLED`
- **AND** `howToFix` includes "Retry after 30 seconds"

#### Scenario: Quota exceeded (403)

- **WHEN** the server responds with 403 and code `quota_exceeded`
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_QUOTA_EXCEEDED`

#### Scenario: Type not implemented (501)

- **WHEN** the server responds with 501 and code `publish_type_not_implemented`
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_TYPE_NOT_SUPPORTED`

#### Scenario: Publishing disabled (503)

- **WHEN** the server responds with 503 and code `publish_disabled`
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_DISABLED`
- **AND** `howToFix` advises trying again later

#### Scenario: Unexpected error status

- **WHEN** the server responds with an unrecognized non-2xx status
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_FAILED`
- **AND** `details` includes the response body for debugging

#### Scenario: Error details preserved

- **WHEN** any error response includes `detail` and `requestId` fields
- **THEN** the `AppError` `details` array includes both values

### Requirement: Authentication error mapping for publish

The remote publish client SHALL map 401 and 403 responses to auth-specific `AppError` codes with recovery guidance.

#### Scenario: Unauthenticated publish (401)

- **WHEN** the publish request returns 401
- **THEN** the method SHALL fail with `AppError` code `AUTH_UNAUTHENTICATED`
- **AND** `howToFix` SHALL read "Session expired. Run `axm login` to re-authenticate."

#### Scenario: Unauthorized publish (403) with scope detail

- **WHEN** the publish request returns 403 with RFC 7807 body containing `required_scope` and `token_scopes`
- **THEN** the method SHALL fail with `AppError` code `AUTH_UNAUTHORIZED`
- **AND** `details` SHALL include the required scope, token scopes, and required role from the response
- **AND** `howToFix` SHALL describe the missing permission

#### Scenario: Unauthorized publish (403) quota exceeded preserved

- **WHEN** the publish request returns 403 with code `quota_exceeded`
- **THEN** the existing `REGISTRY_PUBLISH_QUOTA_EXCEEDED` mapping SHALL take priority over auth mapping
- **AND** the error SHALL NOT be mapped to `AUTH_UNAUTHORIZED`

#### Scenario: 401 includes WWW-Authenticate header context

- **WHEN** the publish request returns 401 with a `WWW-Authenticate` header
- **THEN** `details` SHALL include the `WWW-Authenticate` header value for diagnostics

### Requirement: Network error handling

The remote client SHALL map HTTP transport failures to `AppError`.

#### Scenario: Connection refused

- **WHEN** the HTTP request fails due to a network error (connection refused, DNS failure, timeout)
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_NETWORK_ERROR`
- **AND** the original error is preserved as `cause`

#### Scenario: Non-JSON error response

- **WHEN** the server responds with a non-2xx status and the body is not valid JSON
- **THEN** the method fails with `AppError` code `REGISTRY_PUBLISH_FAILED`
- **AND** `details` includes the raw response text
