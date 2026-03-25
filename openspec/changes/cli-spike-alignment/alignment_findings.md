# cli-spike ↔ Main CLI Alignment Findings

Comparison of `packages/cli-spike` (reference implementation) against `packages/cli` (production CLI) to identify inconsistencies and recommend alignment direction.

---

## 1. `output.result()` schema-driven output unused in main CLI

The spike demonstrates `output.result(schema, data, renderText)` as the canonical pattern for format-agnostic output — text/json/stream-json routing handled transparently by the Output service. The main CLI uses only `output.info()`, `output.warn()`, `output.success()`, etc. No command in the main CLI calls `output.result()`.

**Direction:** spike → main CLI

a) Backport `output.result()` into main CLI commands that emit structured data (e.g., `skills list`, `whoami`, `token`)
b) Remove `output.result()` from the spike and standardize on info/warn/success methods only
c) Leave as-is — adopt incrementally

**Recommendation:** (a) — The spike's pattern is the right direction for JSON output support. Commands that produce data should adopt `output.result()`. Commands that only produce log-style output keep using `output.info()` etc.

**Key files:**

- Spike reference: `packages/cli-spike/src/commands/skills/list.ts` (schema + renderText + `output.result()`)
- Main CLI gap: `packages/cli/src/cli-commands/skills/list/handler.ts` (uses `output.info()` only)

---

## 2. Scope flag — inline vs centralized

The spike defines scope inline in each command:

```typescript
Flag.choice("scope", ["project", "user"] as const).pipe(Flag.withDefault("project" as const));
```

The main CLI centralizes this as `scopeFlag` in `cli-flags/service.ts`, importing `WORKSPACE_SCOPES` and `DEFAULT_WORKSPACE_SCOPE` constants.

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
- Main CLI: `packages/cli/src/telemetry/mode.ts`, `packages/cli/src/runtime.ts` (lines 63–75)
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
| `CommandArgv` service option (argv in foundation layer)                | Yes      | No    |
| `envVerbose` / `envDebug` env var resolution                           | Yes      | No    |

**Direction:** main CLI → spike

a) Backport these features into the spike's `withRuntime`
b) Document the gaps as "production-only" additions

**Recommendation:** (a) — These affect correctness of `--debug` and `--verbose` behavior. A reference implementation should demonstrate them.

**Key files:**

- Spike: `packages/cli-spike/src/runtime.ts` (lines 49–66)
- Main CLI: `packages/cli/src/runtime.ts` (lines 55–61, 131–153)

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

- Main CLI: `packages/cli/src/app.ts` (line 28–29)
- Spike: `packages/cli-spike/src/app.ts` (line 27)

---

## Summary

| #   | Finding                                   | Direction    | Priority | Size   |
| --- | ----------------------------------------- | ------------ | -------- | ------ |
| 1   | `output.result()` unused in main CLI      | spike → main | P1       | Medium |
| 2   | Scope flag inline vs centralized          | main → spike | P2       | Small  |
| 3   | Telemetry resolution interface mismatch   | main → spike | P2       | Small  |
| 4   | Raw `process.env` vs `CliEnvConfig`       | main → spike | P2       | Medium |
| 5   | Missing `withRuntime` features in spike   | main → spike | P2       | Medium |
| 6   | Install command missing `force`/`preview` | main → spike | P3       | Small  |
| 7   | Handler organization difference           | none         | —        | —      |
| 8   | Root command no-subcommand behavior       | main → spike | P3       | Small  |

**P1** — Biggest value-add: adopt `output.result()` in main CLI for structured data commands.
**P2** — Bring the spike in line with production patterns so it remains a trustworthy reference.
**P3** — Small fixes for completeness and consistent UX.
