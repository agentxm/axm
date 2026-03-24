## Why

We have no visibility into how axm is used or when it fails in the wild. Telemetry and error reporting give us the signal to prioritize features, catch regressions, and understand adoption — while respecting user privacy and consent norms.

## What Changes

- Add a `TelemetryClient` Effect service that sends events and error reports to `https://t.agentxm.ai/v1`
- Track CLI command invocations and major lifecycle events (init, install, uninstall, publish, etc.)
- Report unhandled errors and defects to the errors endpoint with sanitized context
- Add a `telemetry` setting with three states: `true` (all telemetry), `false` (nothing), `"errors"` (error reporting only)
- Enabled by default (`true`); environment variable override chain: `DO_NOT_TRACK=1` → `AXM_TELEMETRY=0|errors` → project-scope `settings.telemetry` → user-scope `settings.telemetry` → default `true`
- Telemetry is active from the first command — no special pre-init behavior; delivery is best-effort (fast commands may lose events)
- Display a one-time notice during `axm init` informing the user that anonymous telemetry is enabled and how to disable it
- Automatically disable telemetry in test environments (unit tests and E2E) — no real HTTP calls during tests
- Wire `TelemetryClient` into the CLI runtime layer so all commands can emit events without additional plumbing

## Capabilities

### New Capabilities

- `cli-telemetry`: Telemetry and error reporting service — covers the `TelemetryClient` Effect service, the `telemetry` setting (`true | false | "errors"`), environment variable overrides (`DO_NOT_TRACK`, `AXM_TELEMETRY`), event lifecycle, error capture, and test-mode disabling

### Modified Capabilities

- `cli-init`: Display a telemetry notice during first-time initialization informing the user that anonymous telemetry is enabled and how to disable it

## Impact

- **Settings schema**: New `telemetry` field (`true | false | "errors"`, defaults to `true`); project-scope takes precedence over user-scope
- **Runtime layer**: `TelemetryClient` service added to `AppLayer` in the run boundary; active even without a workspace
- **Error handling**: `run()` error handler reports errors/defects to telemetry before exiting; all `AppError` fields (code, what, details, howToFix) are sent; `cause` is excluded
- **Init command**: Additional notice displayed after successful initialization
- **Network**: New outbound HTTP calls to `https://t.agentxm.ai` (`POST /events`, `POST /errors`) per `api-1.json`; best-effort delivery via daemon fibers (fast commands may lose events)
- **Testing**: All tests must run with telemetry disabled — either via a no-op layer or environment variable detection
- **Dependencies**: Uses existing `HttpClient` from `@effect/platform` — no new dependencies
