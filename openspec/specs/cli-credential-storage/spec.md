# cli-credential-storage Specification

## Purpose

3-tier credential persistence (keychain, encrypted file, plaintext) with versioned schema and environment-aware tier selection.

## Requirements

### Requirement: CredentialStore service interface

The system SHALL provide a `CredentialStore` service with methods to read, write, and clear credentials keyed by registry URL and user handle.

#### Scenario: Save credentials

- **WHEN** `save(registryUrl, handle, credentials)` is called with valid credentials
- **THEN** the credentials SHALL be persisted in the highest-available storage tier
- **AND** the stored entry SHALL include `access_token`, `refresh_token`, `expires_at`, and `active: true`

#### Scenario: Load credentials

- **WHEN** `load(registryUrl)` is called and an active credential entry exists
- **THEN** the method SHALL return the active credentials for the registry URL
- **AND** the return value SHALL include `handle`, `access_token`, `refresh_token`, and `expires_at`

#### Scenario: Load with no credentials

- **WHEN** `load(registryUrl)` is called and no credentials exist
- **THEN** the method SHALL return `Option.none()`

#### Scenario: Clear credentials

- **WHEN** `clear(registryUrl)` is called
- **THEN** all credential entries for the registry URL SHALL be removed from the store
- **AND** if keychain entries exist, they SHALL also be removed

#### Scenario: Storage tier reported

- **WHEN** any credential operation succeeds
- **THEN** the `CredentialStore` SHALL expose the active storage tier (`keychain`, `encrypted-file`, or `plaintext-file`)

### Requirement: Three-tier storage fallback

The `CredentialStore` SHALL attempt storage tiers in order: OS keychain, encrypted file, plaintext file.

#### Scenario: Keychain available

- **WHEN** `@napi-rs/keyring` loads successfully and a test write/read round-trips
- **THEN** the store SHALL use the OS keychain as the storage backend
- **AND** keychain entries SHALL use service `agentxm-cli` and account `{registry_url}:{handle}`

#### Scenario: Keychain unavailable, encrypted file used

- **WHEN** `@napi-rs/keyring` fails to load or the test write fails
- **AND** the environment is not a container
- **THEN** the store SHALL fall back to encrypted file storage at `~/.config/axm/credentials.json`

#### Scenario: Plaintext fallback with warning

- **WHEN** both keychain and encrypted file are unavailable (e.g., container environment)
- **THEN** the store SHALL fall back to plaintext file storage at `~/.config/axm/credentials.json` with `0o600` permissions
- **AND** the store SHALL emit a warning: "Credentials stored in plaintext. Consider using AXM_TOKEN for CI environments."

#### Scenario: Credential directory creation

- **WHEN** `~/.config/axm/` does not exist
- **THEN** the store SHALL create it with `0o700` permissions before writing

### Requirement: Versioned credential file schema

The credential file SHALL use a versioned JSON schema keyed by registry URL.

#### Scenario: Schema structure

- **WHEN** credentials are written to file
- **THEN** the file SHALL contain `{ "version": 1, "registries": { "<url>": { "accounts": { "<handle>": { ... } } } } }`

#### Scenario: Schema validation on read

- **WHEN** the credential file is read
- **THEN** its contents SHALL be validated via Effect Schema
- **AND** invalid or corrupt files SHALL be treated as empty (with a warning) rather than causing a hard failure

#### Scenario: Unknown fields preserved

- **WHEN** the credential file contains fields not in the current schema
- **THEN** those fields SHALL be preserved on write (forward compatibility)

#### Scenario: Multiple registries

- **WHEN** credentials exist for multiple registry URLs
- **THEN** each registry SHALL have its own independent `accounts` map

### Requirement: Environment-aware tier selection

The `CredentialStore` SHALL detect the runtime environment and adjust tier selection.

#### Scenario: SSH environment prefers encrypted file

- **WHEN** `SSH_CLIENT` or `SSH_TTY` environment variable is set
- **THEN** the store SHALL prefer tier 2 (encrypted file) over tier 1 (keychain)

#### Scenario: Container environment uses plaintext

- **WHEN** `/.dockerenv` or `/.containerenv` exists
- **THEN** the store SHALL skip directly to tier 3 (plaintext with warning)

#### Scenario: WSL environment tries keychain first

- **WHEN** `/proc/version` contains `microsoft` (case-insensitive)
- **THEN** the store SHALL try tier 1 (keychain) first, then fall back to tier 2

#### Scenario: Root user warning

- **WHEN** `process.getuid?.()` returns 0
- **THEN** the store SHALL emit a warning: "Running as root. Credentials will be owned by root."

#### Scenario: CI environment

- **WHEN** `CI=true` environment variable is set
- **THEN** the store SHALL NOT attempt interactive credential storage
- **AND** token resolution SHALL rely on `AXM_TOKEN` or `--token` flag

### Requirement: File permissions enforcement

The credential file and its parent directory SHALL have restrictive permissions.

#### Scenario: Directory permissions

- **WHEN** `~/.config/axm/` is created
- **THEN** it SHALL have `0o700` permissions (owner read/write/execute only)

#### Scenario: File permissions

- **WHEN** `~/.config/axm/credentials.json` is written
- **THEN** it SHALL have `0o600` permissions (owner read/write only)

#### Scenario: Permission verification on read

- **WHEN** the credential file exists with permissions more permissive than `0o600`
- **THEN** the store SHALL emit a warning: "Credential file has overly permissive permissions."
- **AND** SHALL still read the file (do not block on permission mismatch)
