## ADDED Requirements

### Requirement: Auth business logic available from core

The `@axm.sh/core/unstable/auth` module SHALL export: `CredentialStore` (credential persistence service), `AuthClient` (OAuth device flow and token refresh), auth middleware (Effect HTTP client middleware for Bearer headers), `resolveToken` (token resolution chain), credential schemas, and `OAuthContract` types.

#### Scenario: CredentialStore importable from core

- **WHEN** a consumer imports `CredentialStore` from `@axm.sh/core/unstable/auth`
- **THEN** the service SHALL provide credential read, write, and delete operations

#### Scenario: AuthClient importable from core

- **WHEN** a consumer imports `AuthClient` from `@axm.sh/core/unstable/auth`
- **THEN** the client SHALL provide device authorization initiation and token polling/refresh

#### Scenario: Token resolution importable from core

- **WHEN** a consumer imports `resolveToken` from `@axm.sh/core/unstable/auth`
- **THEN** it SHALL resolve tokens via the chain: explicit flag/env var, stored credentials (with refresh), then failure

#### Scenario: Auth middleware importable from core

- **WHEN** a consumer imports auth middleware from `@axm.sh/core/unstable/auth`
- **THEN** it SHALL provide Effect HTTP client middleware that adds Bearer authorization headers and handles token refresh on 401

### Requirement: Auth module has no TUI dependencies

The `@axm.sh/core/unstable/auth` module SHALL NOT export or depend on interactive login interaction (device flow TUI prompts) or the auth guard command decorator. These SHALL remain in the CLI package.

#### Scenario: Login interaction stays in CLI

- **WHEN** inspecting exports of `@axm.sh/core/unstable/auth`
- **THEN** `loginInteraction` (device flow TUI with polling display) SHALL NOT be exported

#### Scenario: Auth guard stays in CLI

- **WHEN** inspecting exports of `@axm.sh/core/unstable/auth`
- **THEN** `withAuthGuard` (command handler decorator) SHALL NOT be exported

#### Scenario: Device login orchestration available from core

- **WHEN** a consumer imports `deviceLogin` from `@axm.sh/core/unstable/auth`
- **THEN** the function SHALL orchestrate the OAuth device flow (initiate, poll for token, store credentials) without any TUI rendering
- **AND** progress reporting SHALL be handled via a callback or returned status, not direct TUI interaction

### Requirement: Auth module has no CLI imports

The `@axm.sh/core/unstable/auth` module SHALL only import from `effect/*` and `@axm.sh/core/unstable/*`.

#### Scenario: No CLI module imports

- **WHEN** inspecting all imports in the auth module source files
- **THEN** no import paths SHALL reference `@axm.sh/cli` or relative paths outside core
