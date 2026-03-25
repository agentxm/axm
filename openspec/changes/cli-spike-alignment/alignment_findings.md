# cli-spike ↔ Main CLI Alignment Findings

Comparison of `packages/cli-spike` (reference implementation) against `packages/cli` (production CLI) to identify inconsistencies and recommend alignment direction.

Last verified: 2026-03-25

---

## 1. `output.result()` schema-driven output unused in main CLI

The spike demonstrates `output.result(schema, data, renderText)` as the canonical pattern for format-agnostic output — text/json/stream-json routing handled transparently by the Output service. The main CLI uses only `output.info()`, `output.warn()`, `output.success()`, etc. No command in the main CLI calls `output.result()`.

Worse, some main CLI commands bypass the Output service entirely — `whoami` and `token` use raw `process.stdout.write()` for data output (see Finding 9).

**Direction:** spike → main CLI

a) Adopt `output.result()` in main CLI commands that emit structured data (e.g., `skills list`, `whoami`, `token`)
b) Remove `output.result()` from the spike and standardize on info/warn/success methods only
c) Leave as-is — adopt incrementally

**Recommendation:** (a) — The spike's pattern is the right direction for JSON output support. Commands that produce data should adopt `output.result()`. Commands that only produce log-style output keep using `output.info()` etc.

**Key files:**

- Spike reference: `packages/cli-spike/src/commands/skills/list.ts` (schema + renderText + `output.result()`)
- Main CLI gap: `packages/cli/src/cli-commands/skills/list/handler.ts` (uses `output.info()` / `output.message()` only)

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

## 4. Env configuration — raw `process.env` vs `CliEnvConfig` service

The spike reads environment variables directly (`process.env["AXM_TELEMETRY"]`, `process.env["CI"]`, etc.). The main CLI uses the `CliEnvConfig` Effect service which centralizes config resolution with validation and defaults, and is testable via `CliEnvConfig.testDefaults`.

**Direction:** main CLI → spike

a) Add `CliEnvConfig` dependency to the spike
b) Leave as-is — the spike intentionally minimizes dependencies

**Recommendation:** (a) — Most impactful inconsistency. The spike is the reference implementation and should demonstrate the production config pattern.

**Key files:**

- Spike: `packages/cli-spike/src/runtime.ts` (scattered `process.env` reads)
- Main CLI: `packages/cli/src/config/service.ts`

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

a) Refactor `whoami` and `token` to use `output.result()` with an output schema and text renderer, removing the custom `--json` flag in favor of the global `--output-format` flag
b) Keep `token` as raw stdout (it's a credential pipe) but fix `whoami`
c) Leave as-is

**Recommendation:** (b) — `token` is intentionally a raw credential pipe (stdout-only, no decoration) for scripting use (`axm token | xargs curl -H "Authorization: Bearer $1"`). The `output.result()` pattern doesn't fit here. But `whoami` should use `output.result()` with a schema and the global `--output-format` flag — the custom `--json` flag is inconsistent UX.

**Key files:**

- `packages/cli/src/cli-commands/auth/whoami/handler.ts` (lines 54–75, manual JSON + `--json` flag)
- `packages/cli/src/cli-commands/auth/token/handler.ts` (line 38, raw stdout)
- Spike reference: `packages/cli-spike/src/commands/skills/list.ts` (correct pattern)

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

## Summary

| #   | Finding                                      | Direction    | Priority | Size   |
| --- | -------------------------------------------- | ------------ | -------- | ------ |
| 1   | `output.result()` unused in main CLI         | spike → main | P1       | Medium |
| 9   | Handlers bypass Output with `process.stdout` | spike → main | P1       | Medium |
| 2   | Scope flag inline vs centralized             | main → spike | P2       | Small  |
| 3   | Telemetry resolution interface mismatch      | main → spike | P2       | Small  |
| 4   | Raw `process.env` vs `CliEnvConfig`          | main → spike | P2       | Medium |
| 5   | Missing `withRuntime` features in spike      | main → spike | P2       | Medium |
| 10  | Telemetry wrapper uses `as` type assertions  | main CLI fix | P2       | Small  |
| 6   | Install command missing `force`/`preview`    | main → spike | P3       | Small  |
| 7   | Handler organization difference              | none         | —        | —      |
| 8   | Root command no-subcommand behavior          | main → spike | P3       | Small  |

**P1** — Biggest value-add: adopt `output.result()` in main CLI for structured data commands and stop bypassing the Output service.
**P2** — Bring the spike in line with production patterns so it remains a trustworthy reference. Fix assertion violations.
**P3** — Small fixes for completeness and consistent UX.

### Execution tracks

**Track 1 — Main → Spike (reference integrity):** Findings 2, 3, 4, 5, 6, 8. Brings the spike up to production patterns. Mostly mechanical. Do first — the spike should be trustworthy before using it as a reference for Track 2.

**Track 2 — Spike → Main (feature adoption):** Findings 1, 9. Adopt `output.result()` in main CLI commands that produce data (`skills list`, `whoami`). Highest user-facing value.

**Track 3 — Main CLI internal:** Finding 10. Clean up the telemetry wrapper's type assertions. Small, independent.
