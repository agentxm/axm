# cli-auth-whoami Specification

## Purpose

Identity resolution via `/v1/auth/me` with human-readable and `--json` output.

## ADDED Requirements

### Requirement: Whoami identity display

The `axm whoami` command SHALL resolve and display the current user's identity from the registry.

#### Scenario: Authenticated user

- **WHEN** the user runs `axm whoami` and valid credentials exist
- **THEN** the CLI SHALL call `GET /v1/auth/me`
- **AND** display the user's handle, email, and token type

#### Scenario: Authenticated user with --json

- **WHEN** the user runs `axm whoami --json`
- **THEN** the CLI SHALL call `GET /v1/auth/me`
- **AND** output the full response as JSON to stdout

#### Scenario: Not authenticated

- **WHEN** the user runs `axm whoami` and no credentials are available
- **THEN** the CLI SHALL fail with `CliError` code `AUTH_LOGIN_REQUIRED`
- **AND** `howToFix` SHALL read "Run `axm login` to sign in."

#### Scenario: Token expired and refresh fails

- **WHEN** the user runs `axm whoami` and the token is expired and refresh fails
- **THEN** the CLI SHALL fail with `CliError` code `AUTH_REFRESH_FAILED`
- **AND** `howToFix` SHALL read "Session expired. Run `axm login` to re-authenticate."

### Requirement: Whoami --json flag

The `axm whoami` command SHALL accept a `--json` flag for machine-readable output.

#### Scenario: JSON output format

- **WHEN** `axm whoami --json` succeeds
- **THEN** stdout SHALL contain a JSON object with at minimum `userId`, `userHandle`, `email`, and `tokenType` fields
- **AND** no non-JSON output SHALL be written to stdout

#### Scenario: JSON error output

- **WHEN** `axm whoami --json` fails due to auth error
- **THEN** the error SHALL still be rendered via standard `CliError` handling (not JSON)
