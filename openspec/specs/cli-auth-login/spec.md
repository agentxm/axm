# cli-auth-login Specification

## Purpose

Device authorization grant flow for CLI login — browser launch, manual fallback, device code polling, and credential persistence on success.

## Requirements

### Requirement: Device code flow initiation

The `axm login` command SHALL initiate an RFC 8628 device authorization grant flow by calling `POST /v1/auth/device/code` with `client_id=axm-cli` and session scopes.

#### Scenario: Successful device code request

- **WHEN** the user runs `axm login`
- **THEN** the CLI SHALL send `POST /v1/auth/device/code` with `client_id=axm-cli` and scopes `extensions:read extensions:publish:new extensions:publish:version extensions:yank extensions:admin account:read account:write`
- **AND** receive `device_code`, `user_code`, `verification_uri`, `interval`, and `expires_in`

#### Scenario: Device code request failure

- **WHEN** `POST /v1/auth/device/code` returns a non-2xx response
- **THEN** the CLI SHALL fail with `AppError` code `AUTH_LOGIN_FAILED`
- **AND** `details` SHALL include the server error message
- **AND** `howToFix` SHALL suggest checking network connectivity and trying again

#### Scenario: Unknown client_id rejection

- **WHEN** `POST /v1/auth/device/code` returns 400 with an unknown client_id error
- **THEN** the CLI SHALL fail with `AppError` code `AUTH_LOGIN_FAILED`
- **AND** `howToFix` SHALL suggest updating the CLI to the latest version

### Requirement: Browser launch and manual fallback

After receiving a device code, the CLI SHALL attempt to open the verification URI in the user's default browser and copy the user code to the clipboard.

#### Scenario: Browser launch succeeds

- **WHEN** the device code is received and the browser opens successfully
- **THEN** the CLI SHALL display "Opening browser to sign in..."
- **AND** the CLI SHALL display the user code prominently
- **AND** the CLI SHALL attempt to copy the user code to the clipboard

#### Scenario: Browser launch fails

- **WHEN** the browser fails to open (headless, restricted environment)
- **THEN** the CLI SHALL display the verification URI and user code for manual entry
- **AND** the message SHALL read: "Open this URL in your browser: <verification_uri>"
- **AND** the message SHALL read: "Enter code: <user_code>"

#### Scenario: Clipboard copy is best-effort

- **WHEN** clipboard copy fails (no clipboard available)
- **THEN** the CLI SHALL NOT fail or warn
- **AND** the user code is still displayed on screen

### Requirement: Device code polling

The CLI SHALL poll `POST /v1/auth/device/token` at the server-provided interval until a terminal state is reached.

#### Scenario: Authorization pending

- **WHEN** the poll response contains `error: "authorization_pending"`
- **THEN** the CLI SHALL continue polling at the current interval
- **AND** display a spinner with "Waiting for approval in browser..."

#### Scenario: Slow down

- **WHEN** the poll response contains `error: "slow_down"`
- **THEN** the CLI SHALL increase the polling interval by 5 seconds per RFC 8628
- **AND** continue polling

#### Scenario: Access denied

- **WHEN** the poll response contains `error: "access_denied"`
- **THEN** the CLI SHALL stop polling
- **AND** display "Login canceled."
- **AND** exit with code 1

#### Scenario: Expired token

- **WHEN** the poll response contains `error: "expired_token"`
- **THEN** the CLI SHALL stop polling
- **AND** fail with `AppError` code `AUTH_LOGIN_FAILED`
- **AND** `howToFix` SHALL read "Login code expired. Run `axm login` to try again."

#### Scenario: Successful token issuance

- **WHEN** the poll response contains `access_token`, `refresh_token`, and `expires_at`
- **THEN** the CLI SHALL persist the credentials via `CredentialStore`
- **AND** display "Login successful."

### Requirement: Post-login identity resolution

After successful token issuance, the CLI SHALL fetch the user's identity to key the credential store entry.

#### Scenario: Identity fetch succeeds

- **WHEN** login succeeds and `GET /v1/auth/me` returns user identity
- **THEN** the CLI SHALL store credentials keyed by the user's handle and registry URL
- **AND** display "Logged in as <handle>"

#### Scenario: Identity fetch fails

- **WHEN** login succeeds but `GET /v1/auth/me` fails
- **THEN** the CLI SHALL still persist credentials (keyed by a placeholder)
- **AND** display "Login successful." without the handle

### Requirement: Already logged in behavior

The CLI SHALL detect when the user is already authenticated and offer to re-login.

#### Scenario: Already authenticated

- **WHEN** the user runs `axm login` and valid credentials exist for the target registry
- **THEN** the CLI SHALL display "Already logged in as <handle>."
- **AND** prompt "Log in with a different account?" (respects `--yes` and `--non-interactive`)

#### Scenario: Already authenticated with --yes

- **WHEN** the user runs `axm login --yes` and valid credentials exist
- **THEN** the CLI SHALL proceed with re-login without prompting

### Requirement: Non-interactive login rejection

The CLI SHALL reject interactive login when non-interactive mode is active.

#### Scenario: Non-interactive mode

- **WHEN** the user runs `axm login` in non-interactive mode (explicit flag, CI, or non-TTY)
- **THEN** the CLI SHALL fail with `AppError` code `AUTH_LOGIN_REQUIRED`
- **AND** `howToFix` SHALL read "Set the AXM_TOKEN environment variable or run `axm login` in an interactive terminal."
