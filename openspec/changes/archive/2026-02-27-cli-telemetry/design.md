## Context

axm has no visibility into usage patterns or field errors. The CLI runtime already uses Effect services, layers, and a centralized `run()` boundary with error classification. Settings are stored in `.axm/settings.json` with Schema validation. The `CliFlags` service demonstrates the pattern of resolving configuration once at the runtime boundary from flags + env vars.

The telemetry API is defined in `api-1.json` (OpenAPI 3.0) with two ingest endpoints at `https://t.agentxm.ai`:

- `POST /events` — batched usage events (max 100 events, 64 KB limit)
- `POST /errors` — error reports (max 10 errors per request)
- `GET /ping` — health check

Both ingest endpoints return `202 Accepted` on success and use `application/problem+json` for errors (400, 413, 415, 429).

## Goals / Non-Goals

**Goals:**

- Report CLI command usage events and unhandled errors to the telemetry API
- Let users control telemetry with a single setting: `true | false | "errors"`
- Honor `DO_NOT_TRACK=1` and `AXM_TELEMETRY` environment variables as overrides
- Ensure zero telemetry calls during unit tests and E2E tests
- Fire-and-forget — telemetry never blocks CLI execution or causes user-visible failures

**Non-Goals:**

- Telemetry CLI subcommand (`axm telemetry on/off`) — future change
- User identification or session tracking
- Collecting file paths, file contents, environment variables, or any PII
- Custom event payloads from extensions/skills
- Guaranteed delivery — telemetry is best-effort

## Decisions

### 1. Single `TelemetryClient` Effect service

A `TelemetryClient` service with two methods: `trackEvent(event)` and `reportError(error)`. Both are fire-and-forget — they never fail the caller's Effect.

**Why:** Matches the existing service pattern (`CliFlags`, `Workspace`, etc.). A single service with two methods is simpler than two separate services, and the `telemetry` setting already governs both concerns.

**Alternatives considered:**

- (a) Two services (`Analytics` + `ErrorReporter`) — more granular, but the setting is a single value and the API endpoint is the same. Unnecessary complexity.
- (b) Global function (no service) — can't swap implementations for testing, breaks Effect conventions.

### 2. Telemetry setting: `true | false | "errors"`

A single `telemetry` field in settings with three states:

- `true` — send events and error reports (default)
- `false` — send nothing
- `"errors"` — send error reports only, no usage events

**Why:** One knob is easier to explain and configure. Users who disable usage telemetry almost always still want crash reporting. Avoids 4-state combinatorial complexity of two booleans.

**Resolution chain** (first match wins):

1. `DO_NOT_TRACK=1` → `false` (universal standard, kills everything)
2. `AXM_TELEMETRY` env var → `0`/`false` maps to `false`, `errors` maps to `"errors"`, `1`/`true` maps to `true`
3. `settings.telemetry` field from `.axm/settings.json` — project-scope takes precedence over user-scope
4. Default: `true`

**Why this order:** `DO_NOT_TRACK` is a universal convention — it must override tool-specific settings. `AXM_TELEMETRY` lets CI/automation override per-project settings files. The settings file is the persistent user preference.

**Scope precedence:** When both project-scope (`.axm/settings.json`) and user-scope (`~/.axm/settings.json`) settings exist, the project-scope `telemetry` value takes precedence. This lets projects explicitly control telemetry for their context.

### 3. Resolved at the runtime boundary into a `TelemetryMode`

Like `CliFlags`, the telemetry setting is resolved once in `run()` into a `TelemetryMode` (`"all" | "errors" | "off"`). The `TelemetryClient` layer reads this mode to decide what to send.

The resolution does not require a workspace to exist. When no workspace is present (e.g., running `axm init` for the first time, or commands that don't need a workspace), the resolution chain simply skips step 3 (settings file) and falls through to the default (`true`). Telemetry is active from the first command — no special pre-init behavior.

**Why:** Single resolution point, no scattered env var reads. The mode is determined before any command runs and stays constant for the process lifetime.

**Alternatives considered:**

- (a) Resolve in each handler — scattered, easy to miss, inconsistent behavior.
- (b) Resolve in `TelemetryClient.make()` — acceptable but couples the service to env var knowledge. Better to inject the resolved mode.

### 4. No-op layer for tests

Provide `TelemetryClientTest` — a no-op layer (like `CliFlagsTest`) that silently discards all events. Additionally, auto-detect test environments via `VITEST=true` or `NODE_ENV=test` and use the no-op implementation.

**Why:** Unit tests already provide custom layers. E2E tests run the real CLI binary as a subprocess, so they need env-var-based detection to prevent real HTTP calls.

**Approach for each test type:**

- **Unit tests**: Provide `TelemetryClientTest` layer explicitly (same pattern as `CliFlagsTest`)
- **E2E tests**: The E2E `runCli` helper already sets env vars. Add `AXM_TELEMETRY=0` to the default env in `e2e/utils.ts` so all E2E tests automatically disable telemetry

### 5. Fire-and-forget with `Effect.fork` — accept delivery loss on fast commands

Telemetry calls are forked as daemon fibers. All failures (network errors, timeouts, etc.) are silently swallowed via `Effect.catchAllCause`. The CLI command's success/failure is never affected by telemetry.

For fast commands (<100ms), the daemon fiber may be interrupted before the HTTP request completes, resulting in lost telemetry. This is acceptable because:

- The most valuable events (install, publish, init, errors) occur on slower commands that have time to deliver
- For aggregate analytics, losing some fast-command events (e.g., `skills list`) doesn't materially affect data quality
- Guaranteed delivery would require either added latency (await with timeout) or disk buffering complexity, neither of which is justified for best-effort analytics

**Why:** Users should never see telemetry failures. A 500 from the telemetry API or a network timeout must not degrade the CLI experience.

**Alternatives considered:**

- (a) Await with short timeout (e.g., 2s) — guarantees delivery but adds latency when API is down.
- (b) Background queue with disk buffer and flush-on-next-run — guarantees delivery with zero latency but adds file I/O and queue management complexity.
- (c) `fetch` with `keepalive: true` — allows request to outlive process, but runtime support is inconsistent.

### 6. Command name flows via `RunOptions`

Add `command?: string` to `RunOptions`. Each yargs command passes its command name (e.g., `"skills install"`) when calling `run()`. The `TelemetryClient` layer receives this command name at construction and uses it for both `trackEvent` context and `reportError` context.

This solves the problem of error reporting in `run()`'s `catchAll` — the command name is available at the `run()` boundary, not buried inside the handler. The `reportError` call in `catchAll` uses the command name from `RunOptions` to populate the required `context.command` field in the errors API.

**Why:** Explicit, one-line change per command. The command name is known at the call site and doesn't need to flow through the Effect context.

**Alternatives considered:**

- (a) `FiberRef` set by handlers — implicit, easy to miss, and the handler might fail before setting it.
- (b) `trackEvent` stashes command name for `reportError` — couples the two methods, breaks if `trackEvent` isn't called.

### 7. Error reporting happens in `run()` error handler

The `run()` function's `catchAll` block already classifies errors. After classification, before `Effect.die`, it calls `TelemetryClient.reportError()` (fire-and-forget). This captures both `AppError` (expected, exit code 1) and defects (exit code 2). The command name from `RunOptions` is included in the error context.

**Why:** Centralized — every error passes through `run()`. No risk of missing error reports from individual handlers.

### 8. Event tracking at the handler boundary

Each command handler calls `TelemetryClient.trackEvent()` at entry with the command name and relevant metadata (no PII). This is a single `yield*` call at the top of each handler.

**Why:** Explicit and visible. Each handler opts in by calling the service. No magic middleware or wrapping.

**Alternatives considered:**

- (a) yargs middleware — runs before Effect, can't use the service.
- (b) Wrapper function around `run()` — would need to know the command name, adds indirection.
- (c) Decorator/HOF on handlers — hides the call, harder to reason about.

### 9. Anonymous machine ID via hashed hostname

Generate a stable anonymous identifier by hashing `os.hostname()` with SHA-256. This provides aggregate "unique machines" counts without identifying any user.

**Why:** Needed to distinguish "1 user ran 100 commands" from "100 users ran 1 command each". Hostname hash is not reversible and not PII. Used as `distinctId` in the events API and `user.id` in the errors API.

### 10. CLI version from package.json

The CLI version is already loaded in `main.ts` via `loadVersion()` which reads from `package.json` using `createRequire`. This version string (e.g., `"0.5.0"`) is currently module-scoped and not exported. The telemetry client needs it for the `context.client.version` field.

Export the version from `main.ts` or extract `loadVersion()` into a shared utility so the telemetry layer can access it at construction time.

### 11. API contract and payload schemas

The telemetry API is defined by the OpenAPI spec in `api-1.json`. The client sends:

**Events** (`POST /events`):

```json
{
  "events": [{
    "event": "command_invoked",
    "distinctId": "<hashed-hostname>",
    "timestamp": "<ISO-8601>",
    "properties": { "command": "skills install" }
  }],
  "sentAt": "<ISO-8601>",
  "context": {
    "client": { "name": "cli", "version": "<version>" },
    "os": { "name": "<platform>", "version": "<release>" },
    "runtime": { "name": "bun", "version": "<bun-version>" },
    "device": { "arch": "<arch>" },
    "ci": true|false
  }
}
```

**Errors** (`POST /errors`):

```json
{
  "errors": [{
    "message": "<AppError.what or defect message>",
    "name": "<AppError code or 'Defect'>"
  }],
  "level": "error",
  "handled": true,
  "tags": { "errorCode": "<code>" },
  "fingerprint": ["<error-code>"],
  "user": { "id": "<hashed-hostname>" },
  "sentAt": "<ISO-8601>",
  "context": {
    "client": { "name": "cli", "version": "<version>" },
    "os": { "name": "<platform>", "version": "<release>" },
    "runtime": { "name": "bun", "version": "<bun-version>" },
    "device": { "arch": "<arch>" },
    "ci": true|false,
    "command": "<command-name>"
  }
}
```

### 12. Error payload allowlist

All `AppError` fields are safe to send: `code`, `what`, `details`, `howToFix`. These are developer-authored strings that describe the error condition — they do not contain user file paths, environment variables, or PII. The `cause` field (underlying exception) is NOT sent as it may contain uncontrolled data.

For defects (unhandled exceptions), only the error `name` and `message` are sent. Stack traces are NOT sent as they may contain absolute file paths.

## Risks / Trade-offs

- **Telemetry loss on fast commands** → Accepted trade-off. Most valuable events (install, publish, init, errors) occur on slower commands. Aggregate analytics remain representative.
- **Users unaware telemetry is on** → Mitigated by init-time notice and documentation. `DO_NOT_TRACK` is a well-known convention.
- **Test pollution if `AXM_TELEMETRY=0` is missed** → Mitigated by auto-detecting `VITEST=true` in the layer factory, and setting `AXM_TELEMETRY=0` in E2E utils defaults.
- **Settings field missing on existing workspaces** → Schema uses `Schema.optional`, defaults to `true` at resolution time. No migration needed.
- **API rate limiting (429)** → Silently discarded like all other API failures. A CLI tool invoked by a single user cannot realistically trigger rate limits.
