## Why

The axm CLI currently publishes extensions and interacts with the registry without any authentication. The registry API now has full auth/authz enforcement (Epics 1–5 complete), so CLI operations that require identity — publish, token management, identity queries — will fail without client-side auth support. Users need a complete login-to-publish flow: device code auth, credential persistence, automatic token refresh, and graceful recovery when publishing unauthenticated.

## What Changes

- Add `axm login` command performing RFC 8628 device authorization grant with browser launch and manual fallback.
- Add `axm logout` command that revokes the server token then clears local credentials, with deterministic fallback messaging on remote revoke failure.
- Add `axm whoami` command that resolves and displays identity/session context from `/v1/auth/me`.
- Add `axm token` command that outputs the current token to stdout for piping (no lifecycle subcommands at MVP).
- Add credential storage with 3-tier fallback: OS keychain (`@napi-rs/keyring`) → encrypted file → plaintext file with `0o600` permissions and explicit warnings.
- Add versioned credential file schema (`~/.config/axm/credentials.json`) keyed by registry URL, supporting multi-account future expansion.
- Add auth middleware to the registry HTTP client that performs preflight expiry checks and automatic refresh via `/v1/auth/token/refresh` with single-retry behavior.
- Add non-interactive token resolution precedence: `AXM_TOKEN` env var → `--token` flag → `.axm/config.json` → `~/.config/axm/credentials.json` → interactive prompt.
- Add environment-aware credential behavior: detect SSH, container, WSL, and CI environments to influence storage tier selection and interactive prompt availability.
- Modify `axm publish` (skills, packs) to prompt login when unauthenticated, support sign-up via browser, resume, and retry publish on successful auth.
- Add `Authorization: Bearer <token>` header to all authenticated registry API requests.
- Add auth-specific error handling for `401` (unauthenticated) and `403` (unauthorized) responses with actionable recovery guidance.

## Capabilities

### New Capabilities

- `cli-auth-login`: Device authorization grant flow — browser launch, manual fallback, device code polling, credential persistence on success.
- `cli-auth-logout`: Token revocation and local credential clearing with deterministic fallback on remote failure.
- `cli-auth-whoami`: Identity resolution via `/v1/auth/me` with human-readable and `--json` output.
- `cli-auth-token`: Output current resolved token to stdout for piping and scripting.
- `cli-credential-storage`: 3-tier credential persistence (keychain → encrypted file → plaintext), versioned schema, environment-aware tier selection.
- `cli-auth-middleware`: HTTP auth middleware — token resolution precedence, preflight expiry check, automatic refresh, Bearer header injection.
- `cli-auth-publish-recovery`: Publish-time auth guard that detects unauthenticated state, triggers login flow, and retries the publish operation.

### Modified Capabilities

- `remote-registry-publish`: Add Bearer auth header to publish requests; map `401`/`403` responses to auth-specific `CliError` codes with recovery guidance.
- `remote-registry-read`: Add Bearer auth header to authenticated read requests; handle `401`/`403` responses.
- `registry-client`: Factory wires auth middleware into remote client construction.
- `cli`: Register `login`, `logout`, `whoami`, and `token` as top-level commands.

## Impact

- **New dependencies**: `@napi-rs/keyring` (OS keychain access — native module, optional peer dependency with graceful fallback).
- **CLI commands**: 4 new top-level commands (`login`, `logout`, `whoami`, `token`).
- **Registry client** (`packages/cli/src/registry/`): Auth middleware layer injected into HTTP client pipeline; all remote requests gain Bearer headers.
- **Publish handlers** (`packages/cli/src/cli-commands/skills/publish/`, `packages/cli/src/cli-commands/packs/publish/`): Auth guard added before publish execution with login-and-retry recovery.
- **Settings/config**: New credential file at `~/.config/axm/credentials.json` (separate from workspace settings).
- **Global flags**: No new global flags; `--token` is a new option on auth-sensitive commands.
- **Environment variables**: `AXM_TOKEN` recognized as highest-priority token source.
- **Error codes**: New `AUTH_*` error code family for auth failures (`AUTH_LOGIN_FAILED`, `AUTH_TOKEN_EXPIRED`, `AUTH_REFRESH_FAILED`, `AUTH_UNAUTHORIZED`, etc.).
