# cli-auth-logout Specification

## Purpose

Token revocation and local credential clearing with deterministic fallback on remote failure.

## Requirements

### Requirement: Logout sequence

The `axm logout` command SHALL revoke the server token then clear local credentials, in order.

#### Scenario: Successful logout

- **WHEN** the user runs `axm logout` and credentials exist
- **THEN** the CLI SHALL load the current token from the credential store
- **AND** call `POST /v1/auth/token/revoke` with the access token
- **AND** clear local credentials from the credential store
- **AND** display "Logged out successfully."

#### Scenario: Remote revoke fails

- **WHEN** `POST /v1/auth/token/revoke` fails (5xx, timeout, network error)
- **THEN** the CLI SHALL still clear local credentials
- **AND** display "Signed out locally, but remote revoke failed."
- **AND** display guidance: "Your token may still be active on the server. It will expire automatically."

#### Scenario: No credentials exist

- **WHEN** the user runs `axm logout` and no credentials exist for the target registry
- **THEN** the CLI SHALL display "Not logged in."
- **AND** exit with code 0

### Requirement: Logout is non-interactive safe

The `axm logout` command SHALL work without prompts in all modes.

#### Scenario: Non-interactive logout

- **WHEN** the user runs `axm logout` in non-interactive mode
- **THEN** the CLI SHALL proceed with revoke and clear without prompts
- **AND** behavior SHALL be identical to interactive mode
