> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Foundation: Schemas, Environment Detection, and Credential Store

> **Subagent:** Run this entire phase in a single subagent.

No dependencies. This phase establishes the credential storage layer that all subsequent phases depend on.

- [x] 1.1 Create `packages/cli/src/auth/schema.ts` with Effect Schema definitions: `CredentialEntry` (access_token, refresh_token, expires_at, active), `RegistryAccounts` (accounts map), `CredentialFile` (version, registries map), and `TokenSource` tagged union (env-var, flag, credential-store). Validate with unit tests for encode/decode round-trips.
- [x] 1.2 Create `packages/cli/src/auth/environment.ts` with environment detection functions: `detectSSH` (checks `SSH_CLIENT`/`SSH_TTY`), `detectContainer` (checks `/.dockerenv`/`/.containerenv`), `detectWSL` (checks `/proc/version` for `microsoft`), `detectCI` (checks `CI=true`), `detectRoot` (checks `process.getuid?.()`). Write unit tests for each detector with mocked env/filesystem.
- [x] 1.3 Create `packages/cli/src/auth/credential-store.ts` with `CredentialStore` Effect service (Context.Tag). Implement the 3-tier storage fallback: keychain probe → encrypted file → plaintext file. Methods: `save(registryUrl, handle, credentials)`, `load(registryUrl)` → `Option<StoredCredentials>`, `clear(registryUrl)`, `tier` → active storage tier. Write tests with mocked filesystem and keychain (test each tier independently and the fallback chain).
- [x] 1.4 Implement file permission enforcement in credential store: create `~/.config/axm/` with `0o700`, write credential file with `0o600`, warn on overly permissive existing files. Write tests for directory creation and permission checks.
- [x] 1.5 Implement environment-aware tier selection: SSH prefers tier 2, container skips to tier 3 with warning, WSL tries tier 1 first, root emits warning, CI skips interactive storage. Write tests for each environment override.
- [x] 1.6 Create `packages/cli/src/auth/index.ts` barrel file exporting all public types and services.
- [x] 1.7 Run `pnpm typecheck` — fix any errors.
- [x] 1.8 Run `pnpm lint` — fix any errors.
- [x] 1.9 Run `pnpm test` — fix any failures.
- [x] 1.10 Run `pnpm test:e2e` — fix any failures.
- [x] 1.11 Kill any leftover vitest worker processes.

## 2. Token Resolution and Auth Middleware

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (CredentialStore, TokenSource schema).

- [x] 2.1 Create `packages/cli/src/auth/token-resolution.ts` with `resolveToken(registryUrl)` function returning `Effect<Option<TokenSource>, AppError>`. Implements precedence: `AXM_TOKEN` env var → `--token` flag (from args) → `CredentialStore.load()`. Write tests for each precedence level and the empty case.
- [x] 2.2 Create `packages/cli/src/auth/auth-middleware.ts` with `AuthMiddleware` as a Layer that provides a wrapped `HttpClient.HttpClient`. The wrapper: resolves token via `resolveToken`, injects `Authorization: Bearer <token>` header, checks preflight expiry (5-minute window triggers proactive refresh). Write tests for header injection, pass-through when no token, and non-registry URL pass-through.
- [x] 2.3 Implement automatic refresh on 401 in auth middleware: on 401 response when token source is credential-store, call `POST /v1/auth/token/refresh` with refresh token, persist new credentials, retry original request once. No refresh for env-var or flag tokens. Write tests for refresh-and-retry, refresh failure, and single-retry-only behavior.
- [x] 2.4 Implement proactive refresh in auth middleware: before sending request, if `expires_at` is within 5 minutes, attempt refresh. On proactive refresh failure, proceed with current token. Write tests for near-expiry proactive refresh and failure fallback.
- [x] 2.5 Wire `AXM_TOKEN` stderr message: print "Authenticating via AXM_TOKEN environment variable" to stderr once per CLI invocation when env var is used. Write test.
- [x] 2.6 Update `packages/cli/src/auth/index.ts` barrel to export token resolution and middleware.
- [x] 2.7 Run `pnpm typecheck` — fix any errors.
- [x] 2.8 Run `pnpm lint` — fix any errors.
- [x] 2.9 Run `pnpm test` — fix any failures.
- [x] 2.10 Run `pnpm test:e2e` — fix any failures.
- [x] 2.11 Kill any leftover vitest worker processes.

## 3. Auth Client (Login, Logout, Refresh, Whoami API)

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (CredentialStore), Phase 2 (token resolution).

- [x] 3.1 Create `packages/cli/src/auth/auth-client.ts` with `AuthClient` Effect service (Context.Tag). Methods: `initiateDeviceFlow(registryUrl)`, `pollDeviceToken(registryUrl, deviceCode, interval)`, `refreshToken(registryUrl, refreshToken)`, `revokeToken(registryUrl, accessToken)`, `getMe(registryUrl)`. Each method uses `HttpClient` from context. Write interface and type definitions.
- [x] 3.2 Implement `initiateDeviceFlow`: `POST /v1/auth/device/code` with `client_id=axm-cli` and scopes. Returns device code, user code, verification URI, interval, expires_in. Write tests with mocked HTTP responses (success, error, unknown client_id).
- [x] 3.3 Implement `pollDeviceToken`: poll `POST /v1/auth/device/token` at server interval. Handle all RFC 8628 states: `authorization_pending` (continue), `slow_down` (increase interval +5s), `access_denied` (fail), `expired_token` (fail), success (return tokens). Write tests for each polling state.
- [x] 3.4 Implement `refreshToken`: `POST /v1/auth/token/refresh` with refresh token. Returns new access_token, refresh_token, expires_at. Write tests for success and failure.
- [x] 3.5 Implement `revokeToken`: `POST /v1/auth/token/revoke` with access token. Write tests for success, server error (non-fatal), and timeout.
- [x] 3.6 Implement `getMe`: `GET /v1/auth/me` with Bearer auth. Returns user identity (userId, userHandle, email, tokenType, scopes, orgs). Write tests for success and auth failure.
- [x] 3.7 Create `AuthClientLive` layer that provides the service using `HttpClient` and `CredentialStore` from context.
- [x] 3.8 Update barrel file.
- [x] 3.9 Run `pnpm typecheck` — fix any errors.
- [x] 3.10 Run `pnpm lint` — fix any errors.
- [x] 3.11 Run `pnpm test` — fix any failures.
- [x] 3.12 Run `pnpm test:e2e` — fix any failures.
- [x] 3.13 Kill any leftover vitest worker processes.

## 4. CLI Commands: login, logout, whoami, token

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1–4.2, 4.3–4.4, 4.5–4.6, 4.7–4.8 are independent command pairs — launch as parallel subagents if desired.

Depends on: Phase 3 (AuthClient).

- [x] 4.1 Create `packages/cli/src/cli-commands/auth/login/command.ts` with yargs command definition for `login`. No special flags beyond global flags. Create `command.test.ts` with parser tests.
- [x] 4.2 Create `packages/cli/src/cli-commands/auth/login/handler.ts`. Implements: check existing auth (offer re-login), initiate device flow, open browser (fallback to manual URL+code), poll with spinner, persist credentials, fetch identity, display "Logged in as <handle>". Reject in non-interactive mode. Write `handler.test.ts` with mocked AuthClient and CredentialStore.
- [x] 4.3 Create `packages/cli/src/cli-commands/auth/logout/command.ts` and `command.test.ts`.
- [x] 4.4 Create `packages/cli/src/cli-commands/auth/logout/handler.ts`. Implements: load token, revoke (tolerate failure), clear credentials, display result. Write `handler.test.ts`.
- [x] 4.5 Create `packages/cli/src/cli-commands/auth/whoami/command.ts` with `--json` flag and `command.test.ts`.
- [x] 4.6 Create `packages/cli/src/cli-commands/auth/whoami/handler.ts`. Implements: resolve token, call getMe, display identity (or JSON). Write `handler.test.ts`.
- [x] 4.7 Create `packages/cli/src/cli-commands/auth/token/command.ts` and `command.test.ts`.
- [x] 4.8 Create `packages/cli/src/cli-commands/auth/token/handler.ts`. Implements: resolve token from precedence chain (no interactive fallback), output to stdout. Write `handler.test.ts`.
- [x] 4.9 Create `packages/cli/src/cli-commands/auth/command.ts` — `axm auth` group with `login`, `logout`, `whoami`, `token` subcommands.
- [x] 4.10 Run `pnpm typecheck` — fix any errors.
- [x] 4.11 Run `pnpm lint` — fix any errors.
- [x] 4.12 Run `pnpm test` — fix any failures.
- [x] 4.13 Run `pnpm test:e2e` — fix any failures.
- [x] 4.14 Kill any leftover vitest worker processes.

## 5. CLI Registration and Runtime Wiring

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4 (auth commands), Phase 2 (auth middleware).

- [x] 5.1 Register `authCommand` in `packages/cli/src/main.ts`. Add top-level aliases: `.command("login", ...)`, `.command("logout", ...)`, `.command("whoami", ...)`, `.command("token", ...)` pointing to the auth subcommand handlers.
- [x] 5.2 Wire `AuthMiddleware` layer into `runtime/index.ts`: compose it after `FetchHttpClient.layer` in `AppLayer` so all downstream `HttpClient` consumers get auth-wrapped requests. Auth commands that don't require workspace context SHALL work without workspace layer.
- [x] 5.3 Wire `CredentialStore` layer into `AppLayer` with environment-aware tier selection.
- [x] 5.4 Wire `AuthClient` layer into `AppLayer`.
- [x] 5.5 Ensure auth commands (`login`, `logout`, `whoami`, `token`) work outside workspace-initialized directories — they SHALL NOT require `.axm/settings.json`. Adjust `run()` to support a lighter layer stack for auth-only commands.
- [x] 5.6 Add CLI examples for auth commands in `main.ts`.
- [x] 5.7 Run `pnpm typecheck` — fix any errors.
- [x] 5.8 Run `pnpm lint` — fix any errors.
- [x] 5.9 Run `pnpm test` — fix any failures.
- [x] 5.10 Run `pnpm test:e2e` — fix any failures.
- [x] 5.11 Kill any leftover vitest worker processes.

## 6. Publish Auth Guard and Error Mapping

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5 (auth wired into runtime).

- [x] 6.1 Create `packages/cli/src/auth/guard.ts` with `withAuthGuard` combinator. Pre-publish: check token resolvable. If missing + TTY: prompt "You need to sign in to publish. Sign in now?" (respects `--yes` and `--non-interactive`). On login success: retry inner effect once. Write `guard.test.ts`.
- [x] 6.2 Integrate `withAuthGuard` into `packages/cli/src/cli-commands/skills/publish/handler.ts` — wrap the publish Effect with the auth guard.
- [x] 6.3 Integrate `withAuthGuard` into `packages/cli/src/cli-commands/packs/publish/handler.ts` — wrap the publish Effect with the auth guard.
- [x] 6.4 Add 401/403 error mapping to `packages/cli/src/registry/client-remote.ts` publish path: 401 → `AUTH_UNAUTHENTICATED`, 403 → `AUTH_UNAUTHORIZED` (preserving existing `quota_exceeded` mapping priority). Include `required_scope`, `token_scopes`, `required_role` in details when present.
- [x] 6.5 Add 401/403 error mapping to remote read operations in `client-remote.ts`: `getExtensionsByScope`, `getExtensionPackage`, `namespaceExists`, `extensionExists`.
- [x] 6.6 Write tests for auth error mapping in publish and read paths (401 with/without WWW-Authenticate, 403 with scope details, 403 quota_exceeded preserved).
- [x] 6.7 Update barrel file.
- [x] 6.8 Run `pnpm typecheck` — fix any errors.
- [x] 6.9 Run `pnpm lint` — fix any errors.
- [x] 6.10 Run `pnpm test` — fix any failures.
- [x] 6.11 Run `pnpm test:e2e` — fix any failures.
- [x] 6.12 Kill any leftover vitest worker processes.

## 7. End-to-End Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: All previous phases.

- [x] 7.1 Write E2E test: `axm login` in non-interactive mode fails with `AUTH_LOGIN_REQUIRED`.
- [x] 7.2 Write E2E test: `axm logout` with no credentials displays "Not logged in." and exits 0.
- [x] 7.3 Write E2E test: `axm whoami` with no credentials fails with `AUTH_LOGIN_REQUIRED`.
- [x] 7.4 Write E2E test: `axm token` with `AXM_TOKEN` env var outputs the token and prints source to stderr.
- [x] 7.5 Write E2E test: `axm token` with no credentials fails with `AUTH_LOGIN_REQUIRED`.
- [x] 7.6 Write E2E test: `axm auth` displays subcommand help.
- [x] 7.7 Write E2E test: auth commands work outside an axm-initialized directory (no `.axm/settings.json`).
- [x] 7.8 Run full `pnpm typecheck` — fix any errors.
- [x] 7.9 Run full `pnpm lint` — fix any errors.
- [x] 7.10 Run full `pnpm test` — fix any failures.
- [x] 7.11 Run full `pnpm test:e2e` — fix any failures.
- [x] 7.12 Kill any leftover vitest worker processes.
