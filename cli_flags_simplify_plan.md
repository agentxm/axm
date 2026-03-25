# Simplify CliFlags: Split Environment from Per-Command Flags

## Motivation

`CliFlags` conflates two concerns:

1. **Environment detection** (`isCI`, `nonInteractive`, `verbose`, `debug`) — ambient, resolved once at startup, consumed by cross-cutting services like `InputLive`, error rendering, and debug logging. Has real resolution logic (flag → env var → TTY/defaults, with `debug` implying `verbose`).
2. **Per-command flags** (`yes`, `force`, `preview`) — per-invocation parameters that should flow explicitly through handler args, not be pulled from an ambient service.

Pulling `yes`/`force`/`preview` from a service hides data flow, couples handlers to a global bag, and makes testing require layer wiring for what should be plain arguments.

## End State

- `CliFlags` renamed to `CliEnvironment` — contains `isCI`, `nonInteractive`, `verbose`, `debug`
- `yes`, `force`, `preview` passed explicitly from `command.ts` → handler args
- Consumers that read `yes`/`force`/`preview` from the service receive them as parameters instead
- No `CommandArgvService` dependency in the environment layer (argv only needed for per-command flags, which are now threaded explicitly)
- `envVerbose`/`envDebug` options remain on the environment layer (used by main CLI to pass resolved `AXM_VERBOSE`/`AXM_DEBUG` env vars)

## Consumer Inventory

Current `CliFlags` consumers that read **per-command flags** (need explicit threading):

| Consumer                                                       | File                                                        | Reads                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| `Workspace.resolvePlan`                                        | `packages/cli/src/workspace/service.ts:613`                 | `yes`, `force`, `preview`, `nonInteractive`  |
| `withAuthGuard`                                                | `packages/cli/src/auth/guard.ts:81`                         | `yes`, `nonInteractive`                      |
| `handleLogin`                                                  | `packages/cli/src/cli-commands/auth/login/handler.ts:35`    | `yes`, `nonInteractive`                      |
| `handleUpdate`                                                 | `packages/cli/src/cli-commands/skills/update/handler.ts:87` | `force`                                      |
| Re-provide pattern (skills/packs/commands/mcp-servers install) | various `command-actions.ts`                                | re-provides full `CliFlags` to inner effects |

Current `CliFlags` consumers that read **environment-only** (just rename to `CliEnvironment`):

| Consumer                     | File                                                               | Reads              |
| ---------------------------- | ------------------------------------------------------------------ | ------------------ |
| `InputLive`                  | `packages/core/src/unstable/input/input-live.ts:48`                | `nonInteractive`   |
| `initializeProjectWorkspace` | `packages/cli/src/workspace/initialization.ts:47`                  | `nonInteractive`   |
| `determineSkillsToInstall`   | `packages/cli/src/cli-commands/skills/install/select-skills.ts:48` | `nonInteractive`   |
| `debugLoggerLayer`           | `packages/cli/src/runtime.ts:56`                                   | `debug`            |
| `displayPlan`                | `packages/cli/src/workspace/display-plan.ts:29`                    | `verbose`, `debug` |

## Phases

### Phase 1: Rename `CliFlags` → `CliEnvironment`, remove per-command fields

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 In `packages/core/src/unstable/cli-flags/index.ts`:
  - Rename `CliFlagsService` → `CliEnvironmentService` with `{ isCI: boolean; nonInteractive: boolean; verbose: boolean; debug: boolean }`
  - Rename `CliFlags` class → `CliEnvironment` (keep service tag `"@axm.sh/cli/CliEnvironment"`)
  - Update `makeCliFlagsLayer` → `makeCliEnvironmentLayer` — remove `argv` option, remove `yes`/`force`/`preview` resolution; keep `envVerbose`/`envDebug` options and `verbose`/`debug` resolution logic
  - Update `CliFlagsTest` → `CliEnvironmentTest` — `isCI`, `nonInteractive`, `verbose`, `debug` in overrides
  - Keep flag definitions (`yesFlag`, `forceFlag`, `previewFlag`, `verboseFlag`, `debugFlag`) in this file — they're still used by commands and the runtime envelope
- [ ] 1.2 Update barrel export in `packages/core/src/unstable/cli-flags/index.ts` (all names)
- [ ] 1.3 Update `makeFoundationLayer` in `packages/core/src/unstable/cli-runtime/runtime-envelope.ts`:
  - Import `CliEnvironment` / `makeCliEnvironmentLayer`
  - Remove `argv` from options (no longer needed for flag resolution); keep `envVerbose`/`envDebug` options
  - Update `CliRuntimeFoundation` type alias
- [ ] 1.4 Update `withRuntime` in `packages/cli/src/runtime.ts`:
  - Remove `CommandArgv` lookup and `argv` pass-through to `makeFoundationLayer`
  - Import new names
- [ ] 1.5 Run `pnpm typecheck` — expect many errors from renamed types. Do NOT fix consumers yet (Phase 2 handles that).
- [ ] 1.6 Run `pnpm typecheck`, `pnpm lint`, fix remaining errors in core package only
- [ ] 1.7 Kill any vitest worker processes

### Phase 2: Update environment-only consumers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

These consumers only read environment fields (`nonInteractive`, `isCI`, `verbose`, `debug`) — just update the import and service name.

- [ ] 2.1 `InputLive` (`packages/core/src/unstable/input/input-live.ts`): `yield* CliFlags` → `yield* CliEnvironment`
- [ ] 2.2 `initializeProjectWorkspace` (`packages/cli/src/workspace/initialization.ts`): same rename
- [ ] 2.3 `determineSkillsToInstall` (`packages/cli/src/cli-commands/skills/install/select-skills.ts`): same rename
- [ ] 2.4 `debugLoggerLayer` (`packages/cli/src/runtime.ts`): `CliFlags.asEffect()` → `CliEnvironment.asEffect()` (reads `debug`)
- [ ] 2.5 `displayPlan` (`packages/cli/src/workspace/display-plan.ts`): `yield* CliFlags` → `yield* CliEnvironment` (reads `verbose`, `debug`)
- [ ] 2.6 Update all test files that use `CliFlagsTest` with only environment overrides (`nonInteractive`/`isCI`/`verbose`/`debug`) → `CliEnvironmentTest`
- [ ] 2.7 Update dev-cli TUI commands that use `CliFlagsTest({ nonInteractive: false })` → `CliEnvironmentTest({ nonInteractive: false })`
- [ ] 2.8 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 2.9 Run `pnpm lint` for all packages, fix any errors
- [ ] 2.10 Kill any vitest worker processes

### Phase 3: Thread `yes`/`force`/`preview` explicitly through handlers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

For each consumer that reads per-command flags, add the flags to the handler/function args and pass them from the command definition.

- [ ] 3.1 **`handleLogin`** (`packages/cli/src/cli-commands/auth/login/handler.ts`):
  - Add `{ yes: boolean }` to handler args (it already reads `nonInteractive` from environment — keep that as `yield* CliEnvironment`)
  - Remove `CliFlags` import, replace with `CliEnvironment` for the `nonInteractive` read
  - Update `packages/cli/src/commands/auth/login.ts`: destructure `yes` from command config, pass to `handleLogin({ yes })`

- [ ] 3.2 **`withAuthGuard`** (`packages/cli/src/auth/guard.ts`):
  - Change signature to accept `options: { yes: boolean }` parameter
  - Read `nonInteractive` from `CliEnvironment` (keep as service dep)
  - Remove `CliFlags` from the `R` type, add `CliEnvironment`
  - Update all call sites to pass `{ yes }`:
    - `packages/cli/src/cli-commands/skills/publish/handler.ts` (check if it uses `withAuthGuard`)
    - `packages/cli/src/cli-commands/packs/publish/handler.ts` (check if it uses `withAuthGuard`)
    - Any other callers (grep for `withAuthGuard`)

- [ ] 3.3 **`handleUpdate`** (`packages/cli/src/cli-commands/skills/update/handler.ts`):
  - Add `force: boolean` to `UpdateHandlerArgs`
  - Remove `yield* CliFlags`, use `args.force` instead
  - Update `packages/cli/src/commands/skills/update.ts`: destructure `force`, pass to handler

- [ ] 3.4 **`Workspace.resolvePlan`** (`packages/cli/src/workspace/service.ts:613`):
  - Change `resolvePlan` to accept `(plan: Plan, flags: { yes: boolean; force: boolean; preview: boolean })` — or define a `ResolvePlanFlags` interface
  - Read `nonInteractive` from `CliEnvironment` (keep as service dep for the `resolvedYes` logic)
  - Remove `yield* CliFlags`
  - Update all `resolvePlan` call sites to pass the flags through. This likely means:
    - The `Workspace` service interface exposes `resolvePlan` — callers must pass flags
    - Grep for `resolvePlan(` to find all call sites
    - Each call site is in a handler that knows its flags

- [ ] 3.5 **Re-provide pattern** — remove `Layer.succeed(CliFlags, flags)` in:
  - `packages/cli/src/cli-commands/skills/install/command-actions.ts:200`
  - `packages/cli/src/cli-commands/packs/install/command-actions.ts:185`
  - `packages/cli/src/cli-commands/commands/install/command-actions.ts:111`
  - `packages/cli/src/cli-commands/mcp-servers/install/command-actions.ts:105`
  - These re-provide `CliFlags` to inner effects. Now per-command flags flow through args, so this pattern is unnecessary. These files may still need `CliEnvironment` if inner code reads environment fields.

- [ ] 3.6 Update all test files that use `CliFlagsTest` with `yes`/`force`/`preview` overrides:
  - Tests for `handleLogin`: pass `{ yes: true }` in handler args instead of `CliFlagsTest({ yes: true })`
  - Tests for `withAuthGuard`: pass `{ yes }` parameter instead of `CliFlagsTest({ yes: true })`
  - Tests for `handleUpdate`: pass `force` in handler args
  - Tests for `Workspace.resolvePlan`: pass flags as second arg
  - Tests for command-actions: remove `CliFlagsTest` layer where it was only needed for per-command flags

- [ ] 3.7 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 3.8 Run `pnpm lint` for all packages, fix any errors
- [ ] 3.9 Run `pnpm test` for all packages, fix any failures
- [ ] 3.10 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 3.11 Kill any vitest worker processes

### Phase 4: Clean up dead code and update spec

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2, 3.

- [ ] 4.1 Remove `readBooleanFlag` usage from `makeCliEnvironmentLayer` if no longer called (it may still be used elsewhere — grep first)
- [ ] 4.2 Remove `CommandArgvService` import from cli-flags if no longer needed
- [ ] 4.3 Remove any now-unused imports across touched files
- [ ] 4.4 Update `openspec/specs/cli-flags/spec.md`:
  - Rename to reflect `CliEnvironment` (or create new spec + delete old)
  - Remove requirements about `yes`, `force`, `preview` in the service interface
  - Keep `verbose`/`debug` resolution chain requirements (added by unify-verbosity change)
  - Keep non-interactive resolution chain requirements (they still apply)
  - Add requirements about explicit flag threading through handler args
- [ ] 4.5 Update CLAUDE.md if any references to `CliFlags` flag resolution need updating (check "Resolution model" paragraph under Per-Command Flags)
- [ ] 4.6 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 4.7 Run `pnpm lint` for all packages, fix any errors
- [ ] 4.8 Run `pnpm test` for all packages, fix any failures
- [ ] 4.9 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 4.10 Kill any vitest worker processes

## Design Decisions

**Why keep `nonInteractive` as a service?** It guards `InputLive` — a cross-cutting concern that every prompt implicitly depends on. Threading `nonInteractive` through every handler that might eventually call a prompt would be viral and defeat the purpose. The environment service is the right home for it.

**Why keep `verbose`/`debug` as a service?** Same reasoning — they're consumed by cross-cutting infrastructure (error rendering in `writeExpectedCliError`, debug logger layer, `displayPlan`) that shouldn't require explicit threading. They're resolved once at startup from flags + env vars, with `debug` implying `verbose`. The unify-verbosity change (2026-03-24) already established this pattern — `writeExpectedCliError` reads `verboseFlag`/`debugFlag` from the fiber context, and `displayPlan` reads from the `CliFlags` (→ `CliEnvironment`) service.

**Why not make `yes` part of the environment too?** `yes` is a command-level decision ("skip this confirmation"), not an environment property. Different commands may or may not support `--yes`. Making it ambient means any code can read it regardless of whether the command declared it.

**Why thread through handler args, not a second service?** A `CommandFlags` service would still be ambient and hide data flow. Explicit args are simpler, more testable, and match the existing `HandlerArgs` convention.

**`resolvePlan` flag threading:** `resolvePlan` is the trickiest migration because it's a method on the `Workspace` service (constructed once), not a standalone handler. The flags must be passed per-call. This is actually cleaner — it makes explicit that plan resolution behavior depends on what the user passed for this specific command invocation.
