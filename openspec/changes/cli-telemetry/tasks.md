> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Settings Schema & Telemetry Mode Resolution

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add `telemetry` field to `SettingsSchema` in `packages/cli/src/settings/schema.ts`: `Schema.optional(Schema.Union(Schema.Boolean, Schema.Literal("errors")))`. Add `"telemetry"` to `SETTINGS_KEY_ORDER`.
- [ ] 1.2 Create `packages/cli/src/telemetry/mode.ts` with `TelemetryMode` type (`"all" | "errors" | "off"`) and `resolveTelemetryMode` function implementing the precedence chain: `DO_NOT_TRACK=1` → `AXM_TELEMETRY` env var → project-scope settings → user-scope settings → default `true`. Accept env and settings as parameters (no direct `process.env` reads) for testability.
- [ ] 1.3 Write tests for `resolveTelemetryMode` in `packages/cli/src/telemetry/mode.test.ts` covering: default returns `"all"`, `DO_NOT_TRACK=1` returns `"off"`, `AXM_TELEMETRY=0` returns `"off"`, `AXM_TELEMETRY=errors` returns `"errors"`, `AXM_TELEMETRY=1` returns `"all"`, settings `false` returns `"off"`, settings `"errors"` returns `"errors"`, env overrides settings, `DO_NOT_TRACK` overrides `AXM_TELEMETRY`, project-scope takes precedence over user-scope.
- [ ] 1.4 Run `pnpm typecheck && pnpm lint && pnpm test` — fix any failures.

## 2. TelemetryClient Service & No-op Layer

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [ ] 2.1 Export `loadVersion()` from `packages/cli/src/main.ts` (or extract to a shared utility like `packages/cli/src/version.ts`) so the telemetry layer can access the CLI version.
- [ ] 2.2 Create `packages/cli/src/telemetry/client.ts` with the `TelemetryClient` Effect service (Context.Tag). Interface: `trackEvent(event: string, properties?: Record<string, string>): Effect<void>` and `reportError(error: { name: string; message: string; details?: ReadonlyArray<string>; howToFix?: string; level: "error" | "fatal"; handled: boolean; command: string }): Effect<void>`. Both methods are fire-and-forget (fork as daemon fiber, catch all causes silently).
- [ ] 2.3 Implement `TelemetryClientLive` layer in `packages/cli/src/telemetry/client.ts`. Depends on `HttpClient` and `TelemetryMode`. Builds shared `context` object once at construction (client name/version, os, runtime, device arch, ci flag). Uses hashed `os.hostname()` for `distinctId`/`user.id`. Sends `POST /events` and `POST /errors` per `api-1.json` schema. When mode is `"off"`, both methods are no-ops. When mode is `"errors"`, `trackEvent` is a no-op.
- [ ] 2.4 Implement `TelemetryClientTest` no-op layer (like `CliFlagsTest`) that silently discards all calls. Also implement `VITEST=true` auto-detection in the live layer factory — if `VITEST` env var is set, return the no-op implementation.
- [ ] 2.5 Create barrel file `packages/cli/src/telemetry/index.ts` exporting `TelemetryClient`, `TelemetryClientLive`, `TelemetryClientTest`, `TelemetryMode`, and `resolveTelemetryMode`.
- [ ] 2.6 Write tests for `TelemetryClientLive` in `packages/cli/src/telemetry/client.test.ts`: verify `trackEvent` sends POST to `/events` with correct payload shape, verify `reportError` sends POST to `/errors` with correct payload, verify mode `"off"` sends nothing, verify mode `"errors"` skips events but sends errors, verify API failure is silently swallowed, verify `VITEST=true` returns no-op.
- [ ] 2.7 Run `pnpm typecheck && pnpm lint && pnpm test` — fix any failures.

## 3. Runtime Integration

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2.

- [ ] 3.1 Add `command?: string` to `RunOptions` in `packages/cli/src/runtime/index.ts`.
- [ ] 3.2 Add `TelemetryClient` to the `AppLayer` type union in `packages/cli/src/runtime/index.ts`.
- [ ] 3.3 Wire `TelemetryClientLive` into the `AppLayer` layer composition. Resolve `TelemetryMode` from env vars (and workspace settings when available) in `run()`. Pass the resolved mode and command name to the `TelemetryClientLive` layer factory.
- [ ] 3.4 In `run()`'s `catchAll` block, after `classifyError`, add a fire-and-forget `TelemetryClient.reportError()` call before `Effect.die`. Map `CliError` to `{ name: error.code, message: error.what, details: error.details, howToFix: error.howToFix, level: "error", handled: true, command }`. Map defects to `{ name: "Defect", message: <defect message>, level: "fatal", handled: false, command }`.
- [ ] 3.5 Run `pnpm typecheck && pnpm lint && pnpm test` — fix any failures.

## 4. Command Handler Instrumentation

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1, 4.2, 4.3, 4.4, 4.5 are independent — launch as parallel subagents.

Depends on: Phase 3.

- [ ] 4.1 Add `command: "init"` to `run()` call in `packages/cli/src/cli-commands/init/command.ts`. Add `yield* TelemetryClient.trackEvent("command_invoked", { command: "init" })` at the top of the init handler.
- [ ] 4.2 Add `command` to `run()` calls for all `skills` subcommands (install, uninstall, list, update, enable, disable, fork, rename, new, publish). Add `trackEvent` call at top of each handler.
- [ ] 4.3 Add `command` to `run()` calls for all `packs` subcommands (install, uninstall, new, add, remove, publish, unpack). Add `trackEvent` call at top of each handler.
- [ ] 4.4 Add `command` to `run()` calls for all `mcp-servers` subcommands. Add `trackEvent` call at top of each handler.
- [ ] 4.5 Add `command` to `run()` calls for all `commands` subcommands. Add `trackEvent` call at top of each handler.
- [ ] 4.6 Run `pnpm typecheck && pnpm lint && pnpm test` — fix any failures.

## 5. Init Telemetry Notice

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3.

- [ ] 5.1 Add telemetry notice to the init handler: after successful initialization, display a note informing the user that anonymous telemetry is enabled and how to disable it (`AXM_TELEMETRY=0` or `"telemetry": false` in settings). Skip the notice when telemetry mode is `"off"` (i.e., env vars already disabled it).
- [ ] 5.2 Write/update unit test for init handler verifying the notice is displayed on first-time init and NOT displayed when `AXM_TELEMETRY=0` is set.
- [ ] 5.3 Run `pnpm typecheck && pnpm lint && pnpm test` — fix any failures.

## 6. E2E Test Isolation

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3.

- [ ] 6.1 Add `AXM_TELEMETRY: "0"` to the default env in `packages/cli/src/e2e/utils.ts` (alongside existing `NO_COLOR: "1"`) so all E2E tests automatically disable telemetry.
- [ ] 6.2 Run `pnpm test:e2e` — verify all existing E2E tests pass with the new default env var.
- [ ] 6.3 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any failures. Kill any lingering vitest worker processes.

## 7. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: All previous phases.

- [ ] 7.1 Run full verification: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`. Fix any failures.
- [ ] 7.2 Kill any lingering vitest worker processes.
