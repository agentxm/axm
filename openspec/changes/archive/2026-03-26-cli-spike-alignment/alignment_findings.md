# cli-spike ↔ Main CLI Alignment Findings

Comparison of `packages/cli-spike` (reference implementation) against `packages/cli` (production CLI) to identify inconsistencies and recommend alignment direction.

Last verified: 2026-03-25

---

## 1. ~~Remove `output.result()` from Output service~~ ✓ Done

Removed `output.result()` from the Output service interface, all implementations (OutputLive, OutputStructured, test layer), spike callers, and tests. The API was over-abstracted — process completion signals "done," and Unix stdout/stderr conventions handle routing. Spike commands now use `output.message()` / `output.success()` directly. `OutputLive()` no longer accepts a format parameter. Spec updated to remove the result requirement.

---

## 2. Scope flag — inline vs centralized

The spike defines scope inline in each command:

```typescript
Flag.choice("scope", ["project", "user"] as const).pipe(Flag.withDefault("project" as const));
```

The main CLI centralizes this as `scopeFlag` in `cli-flags/service.ts`, importing `WORKSPACE_SCOPES` and `DEFAULT_WORKSPACE_SCOPE` constants from the workspace feature.

**Direction:** main CLI → spike

a) Update the spike to import the centralized `scopeFlag`
b) Leave as-is — the spike is self-contained by design

**Recommendation:** (a) — The centralized flag is the correct pattern per CLAUDE.md conventions ("co-locate constants with the components that use them" / "shared within feature → dedicated file"). The spike should demonstrate the production pattern.

**Key files:**

- Main CLI: `packages/cli/src/cli-flags/service.ts`
- Spike: `packages/cli-spike/src/commands/skills/list.ts`, `install.ts`

---

## 3. Telemetry mode resolution — different interfaces

The spike imports `resolveTelemetryMode` directly from `@axm.sh/core/unstable/telemetry` and passes `{ doNotTrack, telemetry }` using raw `process.env`. The main CLI has a wrapper in `telemetry/mode.ts` that accepts `{ doNotTrack, axmTelemetry }` and maps to the core interface, reading values from `CliEnvConfig`.

**Direction:** main CLI → spike

a) Update the spike to use `CliEnvConfig` + the main CLI's telemetry wrapper
b) Simplify the main CLI's wrapper to match the spike's direct approach
c) Leave as-is

**Recommendation:** (a) — The main CLI's `CliEnvConfig` approach is more testable and idiomatic (service-based). The spike should demonstrate the production pattern.

**Key files:**

- Spike: `packages/cli-spike/src/runtime.ts` (lines 22–42, raw `process.env`)
- Main CLI: `packages/cli/src/telemetry/mode.ts`, `packages/cli/src/runtime.ts` (lines 62–74)
- Core: `packages/core/src/unstable/telemetry/mode.ts`

---

## 4. ~~`CliEnvConfig` is a grab bag — dissolve into owning services~~ ✓ Done

Dissolved `CliEnvConfig` — the 16-field centralized service that read every env var regardless of domain. Each consumer now reads its own env vars directly at its boundary via `process.env`. The `CliEnvConfig` service, `CliEnvConfigLive` layer, `CliEnvConfig.testDefaults`, `CliEnvConfigOrDie`, and the entire `config/` module have been deleted. Layer-based consumers (`RegistryUrlLayer` in `base-layer.ts`) use Effect's `Config` module with `Layer.orDie`. Effect-based consumers read `process.env` directly — no `ConfigError` in the type channel, matching the spike's approach. Tests that need specific env var values set/restore `process.env` directly. All 2264 tests pass.

---

## 5. Missing features in spike's `withRuntime`

The main CLI's `withRuntime` includes features absent from the spike:

| Feature                                                                | Main CLI | Spike |
| ---------------------------------------------------------------------- | -------- | ----- |
| `debugLoggerLayer` (conditional `Logger.consolePretty()` on `--debug`) | Yes      | No    |
| `envVerbose` / `envDebug` env var resolution                           | Yes      | No    |

Note: Both codebases use `withArgvTracking` at the command level for argv tracking — neither passes `CommandArgv` through `withRuntime`.

**Direction:** main CLI → spike

a) Backport these features into the spike's `withRuntime`
b) Document the gaps as "production-only" additions

**Recommendation:** (a) — These affect correctness of `--debug` and `--verbose` behavior. A reference implementation should demonstrate them.

**Key files:**

- Spike: `packages/cli-spike/src/runtime.ts` (lines 49–66)
- Main CLI: `packages/cli/src/runtime.ts` (lines 54–60, 130–150)

---

## 6. Install command flag coverage

The spike's `skills install` has `scope`, `skill`, `all`, `yes`. The main CLI's `skills install` adds `force` and `preview`. The spike's own `skills uninstall` already demonstrates `force` and `preview`, making the omission from install inconsistent within the spike itself.

**Direction:** main CLI → spike

a) Add `force` and `preview` to the spike's install command
b) Leave as-is — it's a stub

**Recommendation:** (a) — Small fix. Makes the spike's install a complete reference for per-command flags.

**Key files:**

- Spike: `packages/cli-spike/src/commands/skills/install.ts` (missing `force`, `preview`)
- Main CLI: `packages/cli/src/commands/skills/install.ts` (has both)
- Spike reference: `packages/cli-spike/src/commands/skills/uninstall.ts` (already has both)

---

## 7. Handler organization — co-located vs separated

The spike puts handler logic directly in command files (`commands/skills/list.ts` contains parsing + business logic). The main CLI separates parsers (`commands/skills/install.ts`) from handlers (`cli-commands/skills/install/handler.ts`) and workflow actions (`cli-commands/skills/install/command-actions.ts`).

**Direction:** none

a) Restructure the spike to match the main CLI's separation
b) Leave as-is — the spike intentionally shows the minimal version

**Recommendation:** (b) — The spike is intentionally compact. The separation pattern is documented in CLAUDE.md and demonstrated by the main CLI. Adding it to the spike would obscure the core patterns it's trying to demonstrate (Output, Activity, withRuntime).

---

## 8. Root command behavior when no subcommand given

The main CLI shows help and exits with code 1 via `Effect.fail(effectCliExit(1))`. The spike relies on default Effect CLI behavior (no explicit handler for the root command).

**Direction:** main CLI → spike

a) Match the main CLI's explicit help + exit 1 pattern
b) Leave as-is

**Recommendation:** (a) — Small fix, ensures consistent UX. Users running `axm-spike` with no args should see help and get exit code 1, same as `axm`.

**Key files:**

- Main CLI: `packages/cli/src/app.ts` (lines 28–29)
- Spike: `packages/cli-spike/src/app.ts` (line 27)

---

## 9. Main CLI handlers bypass Output service with raw `process.stdout.write()`

Several main CLI handlers write directly to `process.stdout` instead of using the Output service:

- **`whoami`** (`cli-commands/auth/whoami/handler.ts`) — has a custom `--json` flag and manually calls `process.stdout.write(JSON.stringify(...))` for JSON output, while using `output.info()` for text mode. This creates two problems: it bypasses the Output service's format routing, and it introduces a per-command `--json` flag that's inconsistent with the global `--output-format` flag.
- **`token`** (`cli-commands/auth/token/handler.ts`) — uses `process.stdout.write(token + "\n")` directly.

**Direction:** spike → main CLI

a) Refactor `whoami` to use the Output service (`output.message()` / `output.info()`) and remove the custom `--json` flag. Refactor `token` to use Output service for consistency.
b) Keep `token` as raw stdout (it's a credential pipe) but fix `whoami` to use the Output service
c) Leave as-is

**Recommendation:** (b) — `token` is intentionally a raw credential pipe (stdout-only, no decoration) for scripting use (`axm token | xargs curl -H "Authorization: Bearer $1"`). But `whoami` should use the Output service and drop the custom `--json` flag — the per-command flag is inconsistent UX. JSON output support can be designed later if needed (see Finding 1).

**Key files:**

- `packages/cli/src/cli-commands/auth/whoami/handler.ts` (lines 54–75, manual JSON + `--json` flag)
- `packages/cli/src/cli-commands/auth/token/handler.ts` (line 38, raw stdout)

---

## 10. Telemetry wrapper uses `as` type assertions

The main CLI's `telemetry/mode.ts` uses `as Record<string, string | undefined>` assertions (lines 21, 25) to handle a dual-interface function signature. This violates the project's "No Type Assertions" rule (CLAUDE.md).

**Direction:** main CLI internal fix

a) Remove the `Record<string, string | undefined>` overload — accept only `TelemetryEnvValues` and convert at the call site
b) Use a type guard or `"key" in obj` narrowing instead of assertions
c) Leave as-is — the wrapper is small and contained

**Recommendation:** (a) — The dual-interface (`TelemetryEnvValues | Record<...>`) exists to support a raw env passthrough that nobody uses. Simplify to a single clean interface. The spike bypasses this wrapper entirely (Finding 3), so fixing it now prepares for spike alignment.

**Key files:**

- `packages/cli/src/telemetry/mode.ts` (lines 14–33, `as` assertions on lines 21, 25)

---

## 11. Extract `verbose`/`debug` from `CliEnvironment` into Output service

`CliEnvironment` currently holds `{ isCI, nonInteractive, verbose, debug }`. The first two are execution context — they answer "what kind of environment am I in?" and affect control flow (prompting, auth tier selection). `verbose` and `debug` are observability knobs — they control what the user sees, not what environment the program runs in. They don't belong together.

Current consumers of `verbose`/`debug` from `CliEnvironment`:

- **`runtime.ts:54-60`** — `debugLoggerLayer` reads `flags.debug` to decide whether to enable `Logger.consolePretty()`. Pure logging configuration.
- **`display-plan.ts:30-33`** — reads `flags.verbose` and `flags.debug`, passes `{ verbose, debug }` to `renderAppError()` for error rendering detail. Output concern.

**Direction:** main CLI internal fix

a) **Logging**: Resolve `--debug` flag directly at the runtime boundary into Effect log level configuration (`Logger.layer()`). No service field needed — it's layer composition at the edge.
**Output verbosity**: Add verbosity to the Output service (e.g., `verbosity: "normal" | "verbose" | "debug"`). `renderAppError` and `display-plan` read verbosity from Output instead of CliEnvironment. The Output service already controls what the user sees — verbosity is a natural fit.
**CliEnvironment**: Shrinks to `{ isCI, nonInteractive }` — pure execution context.
b) Extract into a standalone `Verbosity` service separate from both CliEnvironment and Output.
c) Leave as-is.

**Recommendation:** (a) — Logging is layer config, not service state. Output verbosity belongs with Output (the service that controls what the user sees). CliEnvironment becomes a clean execution-context service. Option (b) adds a new service for two booleans consumed in two places — not worth the abstraction.

**Key files:**

- Core: `packages/core/src/unstable/cli-flags/index.ts` (lines 64–96, `CliEnvironmentService` + `makeCliEnvironmentLayer`)
- Main CLI: `packages/cli/src/runtime.ts` (lines 54–60, `debugLoggerLayer` reads `flags.debug`)
- Main CLI: `packages/cli/src/workspace/display-plan.ts` (lines 29–33, reads `flags.verbose`/`flags.debug` for error rendering)
- Core: `packages/core/src/unstable/output/` (Output service — target for verbosity)

---

## Summary

| #   | Finding                                              | Direction    | Priority | Size   |
| --- | ---------------------------------------------------- | ------------ | -------- | ------ |
| 4   | ~~`CliEnvConfig` grab bag — dissolve into features~~ | ✓ Done       | P1       | Medium |
| 9   | Handlers bypass Output with `process.stdout`         | main CLI fix | P1       | Medium |
| 11  | Extract `verbose`/`debug` from `CliEnvironment`      | main CLI fix | P1       | Medium |
| 2   | Scope flag inline vs centralized                     | main → spike | P2       | Small  |
| 3   | Telemetry resolution interface mismatch              | main → spike | P2       | Small  |
| 5   | Missing `withRuntime` features in spike              | main → spike | P2       | Medium |
| 10  | Telemetry wrapper uses `as` type assertions          | main CLI fix | P2       | Small  |
| 1   | ~~Remove `output.result()` from Output service~~     | ✓ Done       | P3       | Small  |
| 6   | Install command missing `force`/`preview`            | main → spike | P3       | Small  |
| 7   | Handler organization difference                      | none         | —        | —      |
| 8   | Root command no-subcommand behavior                  | main → spike | P3       | Small  |

**P1** — Structural fixes: ~~dissolve `CliEnvConfig` grab bag~~ ✓, stop bypassing Output with raw `process.stdout.write()`, extract verbose/debug from `CliEnvironment` into Output service + logging layer.
**P2** — Bring the spike in line with production patterns so it remains a trustworthy reference. Fix assertion violations.
**P3** — Small cleanups for completeness and consistent UX.

### Execution tracks

**Track 1 — Main CLI structural fixes:** Findings ~~4~~ ✓, 9, 10, 11. ~~Dissolve `CliEnvConfig` into owning services.~~ ✓ Stop bypassing Output in `whoami`. Clean up telemetry type assertions. Extract verbose/debug from `CliEnvironment` — logging becomes layer config at the runtime boundary, output verbosity moves to the Output service. Do first — the spike should align to the corrected main CLI patterns, not the current ones.

**Track 2 — Main → Spike (reference integrity):** Findings 2, 3, 5, 6, 8. Brings the spike up to production patterns. Mostly mechanical. Finding 3 (telemetry) and the spike's `process.env` reads naturally align once `CliEnvConfig` is dissolved (Track 1). Finding 5 (missing `withRuntime` features) will be simpler after Finding 11 clarifies where verbose/debug live.

**Track 3 — ~~Remove `output.result()`~~:** ✓ Done. Removed from interface, all implementations, spike callers, tests, and spec.
