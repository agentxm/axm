## Context

The axm CLI currently has no authentication. All registry operations (publish, read) execute without identity. The AgentXM registry API (Epics 1–5) now enforces authentication and authorization on protected routes. This change adds client-side auth to the CLI so it can participate in the authenticated registry ecosystem.

**Current state:**

- `run()` in `runtime/index.ts` composes `AppLayer` (NodeContext, FetchHttpClient, Clack, CliFlags, Telemetry) with Workspace and SourceHostProviders layers.
- Registry client is created ad-hoc via `createRegistryClient(location)` — not an Effect service. It pulls `HttpClient` from context at construction time.
- No credential storage, token resolution, or auth headers exist anywhere in the CLI.
- Publish handlers call `client.publishExtension()` without auth context.

**Key constraints:**

- All I/O uses `@effect/platform` (FileSystem, Path, HttpClient) — no raw `node:fs` or `node:path`.
- Single error type `CliError` for all expected failures.
- Effect services with layers provided at the `run()` boundary.
- Credential file at `~/.config/axm/credentials.json` (separate from workspace `.axm/settings.json`).

## Goals / Non-Goals

**Goals:**

- Users can `axm login` via device code flow and publish authenticated extensions.
- Credentials persist across sessions with platform-appropriate security (keychain preferred).
- Token refresh happens automatically — users rarely see expired-token errors.
- Unauthenticated publish triggers an inline login flow and retries.
- CI/scripting works via `AXM_TOKEN` env var or `--token` flag without interactive prompts.
- Environment detection (SSH, container, WSL, CI) selects appropriate storage tier and prompt behavior.

**Non-Goals:**

- Multi-account switching (`axm auth switch`) — future.
- `axm token create/list/revoke` CLI subcommands — API exists (Epic 5), CLI deferred.
- OIDC trusted publishing (`axm_oidc_` tokens) — post-MVP.
- Org context transport (`X-Org-Handle`) — deferred per authentication.md.
- Web UI for token management — registry API only.

## Decisions

### D1: Auth as an Effect service, not embedded in registry client

**Decision:** Create a `CredentialStore` service and an `AuthClient` service. Wire auth into the HTTP pipeline via an `authMiddleware` that wraps `HttpClient` with Bearer headers and auto-refresh.

**Alternatives considered:**

- (a) Embed auth directly in `createRemoteRegistryClient` — couples auth logic to one consumer; other future HTTP callers would need to duplicate it.
- (b) Auth as a global flag/config only — no refresh, no storage abstraction, no recovery.

**Rationale:** Following the existing patterns (TelemetryClient, Workspace), standalone services compose cleanly via layers and are independently testable. The middleware approach means any Effect code using `HttpClient` from context automatically gets auth headers — registry client doesn't change its interface.

### D2: Three new service boundaries

```
CredentialStore  — read/write/clear credentials per registry URL
AuthClient       — login (device flow), logout, refresh, whoami
AuthMiddleware   — HttpClient wrapper: resolve token → inject Bearer → auto-refresh on 401
```

**CredentialStore** is the storage abstraction (keychain/encrypted/plaintext). It has no network I/O.

**AuthClient** uses `HttpClient` for registry auth API calls (`/v1/auth/device/code`, `/v1/auth/device/token`, `/v1/auth/token/refresh`, `/v1/auth/token/revoke`, `/v1/auth/me`). It uses `CredentialStore` to persist results.

**AuthMiddleware** is a layer that provides a wrapped `HttpClient`. It resolves tokens from the precedence chain, injects `Authorization: Bearer <token>`, and on 401 response attempts one refresh-and-retry cycle.

### D3: Token resolution precedence chain

```
1. AXM_TOKEN env var        → stderr: "Authenticating via AXM_TOKEN environment variable"
2. --token flag             → passed via CliFlags or command args
3. Credential store lookup  → by registry URL from CredentialStore
4. Interactive login prompt → TTY only, non-interactive mode errors
```

**Decision:** Resolution is a pure function `resolveToken(registryUrl)` that returns `Effect<TokenSource, CliError>` where `TokenSource` carries the token value and its origin (for diagnostics). Steps 1-2 are checked first (no I/O); step 3 reads from CredentialStore; step 4 triggers device flow if TTY is available.

Step 4 (interactive login) is only used during publish-time recovery, not during general token resolution. For non-publish commands, missing credentials after step 3 result in an error with guidance to run `axm login`.

### D4: Credential storage tiers and environment detection

| Tier | Backend                                                      | Detection                              | Notes                                                       |
| ---- | ------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------- |
| 1    | OS keychain via `@napi-rs/keyring`                           | Try keychain write; catch native error | macOS Keychain, Windows Credential Manager, Linux libsecret |
| 2    | Encrypted file `~/.config/axm/credentials.json`              | Keychain unavailable, not a container  | Encryption key derived from machine identity                |
| 3    | Plaintext file `~/.config/axm/credentials.json` with `0o600` | Container or encryption unavailable    | Always warns on use                                         |

**Environment overrides:**

| Environment | Detection                                | Effect                                                    |
| ----------- | ---------------------------------------- | --------------------------------------------------------- |
| SSH         | `SSH_CLIENT` or `SSH_TTY` env            | Prefer tier 2 over tier 1 (keychain may not be available) |
| Container   | `/.dockerenv` or `/.containerenv` exists | Skip to tier 3 with warning                               |
| WSL         | `/proc/version` contains `microsoft`     | Try tier 1, fall back to tier 2                           |
| CI          | `CI=true` env                            | Skip interactive prompts; expect `AXM_TOKEN`              |
| Root        | `process.getuid?.() === 0`               | Warn about root-owned credentials                         |

**Decision:** `@napi-rs/keyring` is an optional dependency. If the native module fails to load (missing binary, unsupported platform), fall through to tier 2 gracefully. The credential file uses the same versioned schema regardless of tier (2 vs 3) — the only difference is whether content is encrypted.

**Alternatives considered:**

- (a) Require keychain — breaks containers, SSH, CI.
- (b) Plaintext only — insecure default for desktop users.
- (c) Use `keytar` — deprecated, `@napi-rs/keyring` is the maintained successor.

### D5: Credential file schema

```json
{
  "version": 1,
  "registries": {
    "https://registry.agentxm.ai": {
      "accounts": {
        "alice": {
          "access_token": "axm_ses_...",
          "refresh_token": "axm_ref_...",
          "expires_at": "2026-03-12T10:30:00Z",
          "active": true
        }
      }
    }
  }
}
```

Per `authentication.md` §151-172. Schema is validated via Effect Schema on read. Unknown fields are preserved (forward compat). The `version` field gates future migrations.

### D6: Auth middleware — HttpClient wrapping pattern

**Decision:** `AuthMiddleware` provides a modified `HttpClient` that intercepts requests:

1. Before request: resolve token from precedence chain. If found, add `Authorization: Bearer <token>` header.
2. After response: if 401 and token came from credential store, attempt one refresh via `/v1/auth/token/refresh`. On success, persist new credentials, retry original request. On refresh failure, return the 401 with guidance to `axm login`.
3. Requests to non-registry URLs pass through unmodified.

This is implemented as an `HttpClient` middleware layer (Effect `Layer.effect` that yields `HttpClient.HttpClient` by wrapping the underlying client). The existing `createRegistryClient` factory already pulls `HttpClient` from context — so wiring the auth middleware upstream automatically authenticates all registry requests.

**Layer composition in `run()`:**

```
AppLayer (includes FetchHttpClient)
  → AuthMiddleware (wraps HttpClient with Bearer + refresh)
    → Workspace, SourceHostProviders (use wrapped HttpClient)
```

### D7: Device code flow implementation

The `axm login` flow:

1. `POST /v1/auth/device/code` with `client_id=axm-cli` and scopes.
2. Receive `device_code`, `user_code`, `verification_uri`, `interval`, `expires_in`.
3. Copy `user_code` to clipboard (best-effort, no error on failure).
4. Open `verification_uri` in browser via `open` package. If browser launch fails, show manual URL + code.
5. Display spinner: "Waiting for approval in browser..."
6. Poll `POST /v1/auth/device/token` at server-provided interval.
   - `authorization_pending` → continue polling.
   - `slow_down` → increase interval by 5s per RFC 8628.
   - `access_denied` → stop, show "Login canceled."
   - `expired_token` → stop, show "Login code expired. Run `axm login` to try again."
   - Success → persist credentials, show "Login successful."
7. On success, call `GET /v1/auth/me` to fetch user handle for credential store keying.

**Scopes requested at login:** `extensions:read extensions:publish:new extensions:publish:version extensions:yank extensions:admin account:read account:write` — full session scope per authentication.md. Scope narrowing is for PATs, not sessions.

### D8: Command structure — top-level aliases

```
axm login       → device code flow
axm logout      → revoke + clear
axm whoami      → /v1/auth/me display
axm token       → output current token to stdout
```

Per authentication.md, `axm login` aliases `axm auth login`. Reserve `axm auth` group for future subcommands (`auth status`, `auth switch`, `auth refresh`). Implement as:

- `cli-commands/auth/login/` — handler + command
- `cli-commands/auth/logout/` — handler + command
- `cli-commands/auth/whoami/` — handler + command
- `cli-commands/auth/token/` — handler + command
- `cli-commands/auth/command.ts` — `axm auth` group with subcommands
- `main.ts` — register `authCommand` group + top-level aliases for `login`, `logout`, `whoami`, `token`

### D9: Publish-time auth recovery

When `axm skills publish` (or `axm packs publish`) encounters a missing-auth state:

1. Check if token is resolvable before publish attempt.
2. If no token and TTY available: prompt "You need to sign in to publish. Sign in now?" (respects `--yes` and `--non-interactive`).
3. If user accepts: run device code login flow inline.
4. On login success: retry the publish operation once.
5. On login failure or decline: fail with `CliError` code `AUTH_LOGIN_REQUIRED` and guidance to run `axm login`.

This is implemented as a reusable `withAuthGuard` combinator that wraps any Effect requiring auth:

```typescript
const withAuthGuard = <A>(effect: Effect<A, CliError, ...>) => Effect<A, CliError, ...>
```

### D10: New file organization

```
packages/cli/src/
  auth/                        # Auth feature folder
    credential-store.ts        # CredentialStore service (3-tier storage)
    credential-store.test.ts
    auth-client.ts             # AuthClient service (device flow, refresh, revoke, me)
    auth-client.test.ts
    auth-middleware.ts          # HttpClient auth middleware layer
    auth-middleware.test.ts
    token-resolution.ts        # Token precedence chain
    token-resolution.test.ts
    environment.ts             # Environment detection (SSH, container, WSL, CI)
    environment.test.ts
    schema.ts                  # Credential file schema, token types
    guard.ts                   # withAuthGuard combinator for publish recovery
    guard.test.ts
    index.ts                   # Barrel exports
  cli-commands/auth/
    login/
      command.ts
      command.test.ts
      handler.ts
      handler.test.ts
    logout/
      command.ts
      command.test.ts
      handler.ts
      handler.test.ts
    whoami/
      command.ts
      command.test.ts
      handler.ts
      handler.test.ts
    token/
      command.ts
      command.test.ts
      handler.ts
      handler.test.ts
    command.ts                 # axm auth group
```

### D11: `--token` flag scope

**Decision:** `--token` is NOT a global flag. It is available on commands that make authenticated requests (`publish`, `login` excluded). This avoids polluting `--help` for commands like `init` that have no auth.

Token from `--token` flag is passed through command args to the handler, which provides it to the token resolution chain. The `AXM_TOKEN` env var is always checked regardless of command.

**Alternative considered:** Global `--token` flag — rejected because most commands don't use it, and it would clutter help output.

### D12: Error codes

New error code family:

| Code                           | Trigger                                             |
| ------------------------------ | --------------------------------------------------- |
| `AUTH_LOGIN_REQUIRED`          | No credentials and non-interactive mode             |
| `AUTH_LOGIN_FAILED`            | Device flow failed (denied, expired, network)       |
| `AUTH_LOGIN_CANCELLED`         | User cancelled login prompt                         |
| `AUTH_REFRESH_FAILED`          | Token refresh failed after retry                    |
| `AUTH_TOKEN_EXPIRED`           | Token expired and refresh unavailable               |
| `AUTH_REVOKE_FAILED`           | Remote revoke failed (local cleared, warning shown) |
| `AUTH_CREDENTIAL_STORE_FAILED` | Failed to read/write credential store               |
| `AUTH_UNAUTHORIZED`            | 403 from registry — insufficient role/scope         |
| `AUTH_UNAUTHENTICATED`         | 401 from registry after refresh attempt             |

All follow the existing `CliError` pattern with `what`, `details`, `howToFix`, and `cause`.

## Risks / Trade-offs

**[Native dependency]** `@napi-rs/keyring` requires platform-specific binaries.
→ Optional dependency with graceful fallback. If it fails to load, skip to tier 2. Publish prebuilt binaries for common platforms via the package's own npm distribution.

**[Encrypted file security]** Tier 2 encryption key derivation from machine identity is not a strong security boundary.
→ Acceptable for MVP. Defense in depth: keychain is preferred, encrypted file is better-than-plaintext, and credential file permissions (`0o600`) add OS-level protection. Document that tier 2 protects against casual file reads, not determined attackers with machine access.

**[Browser launch reliability]** `open` package may fail in headless or restricted environments.
→ Always show the manual URL + code as fallback text. The device code flow is designed for this — manual entry on any device is a first-class path.

**[Refresh race condition]** Two concurrent CLI processes could both attempt refresh with the same one-time-use refresh token.
→ The first succeeds; the second gets a rejection (consumed token) and falls back to login prompt. This is acceptable for CLI usage patterns. File-level locking for credential writes prevents corruption.

**[Token in clipboard]** Copying the user code to clipboard could be a concern in shared environments.
→ The user code is short-lived and non-sensitive (it's displayed on screen anyway). Only the user code goes to clipboard, never the access/refresh token.

## Migration Plan

No migration required. This is net-new functionality added to an existing CLI. No existing behavior changes — unauthenticated local registry operations continue to work. The auth middleware only injects Bearer headers when credentials are available.

**Rollout:**

1. Ship auth commands (`login`, `logout`, `whoami`, `token`) first — users can authenticate independently.
2. Ship auth middleware and publish recovery — authenticated publish becomes possible.
3. Registry enables auth enforcement on publish routes — unauthenticated publish stops working.

## Open Questions

None — all key decisions are covered by `authentication.md` and `authorization.md` design docs. Implementation details will be resolved during task execution.
