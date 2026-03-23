# Effect v4 CLI Refactor Plan

Bring `packages/cli` into conformance with `contributing/guides/cli-design.md`,
aligned with the `packages/cli-spike` reference implementation.

## Current State

The CLI has a **split architecture** with structural problems:

1. **Monolithic entry point** — `main-effect-cli.ts` (1020 lines) defines every
   command inline using `makeLeafCommand()`/`makeGroupCommand()` helpers. Commands
   should be single-file modules per the design guide.

2. **Double runtime** — Effect CLI parses args in `main-effect-cli.ts`, then each
   `command.ts` independently calls `run()` which creates a separate
   `ManagedRuntime`. Services are provided twice and the architecture is split
   between parsing and execution.

3. **No structured output** — Missing `--output-format` flag, `writeOutput()`
   helper, NDJSON streaming, Schema-based output contracts, and `_version` fields.

4. **No three-channel error handling** — Errors go to stderr only. No typed error
   JSON on stdout for programmatic consumers.

5. **No graceful shutdown** — No SIGTERM/SIGINT handling with fiber interruption
   for subprocess management.

6. **Indirect command wiring** — `executeCommand()` bridges parsed argv from
   Effect CLI to async handler functions via `Promise`. Handlers should be Effect
   programs running within the CLI framework's context.

## Target Architecture

Single execution path: Effect CLI parses → handler runs as Effect program →
services provided once at `run()` boundary. Each leaf command is a self-contained
file. Output flows through format-aware helpers.

```
packages/cli/src/
├── main.ts                  # Entry point (shebang + runEffectCli call)
├── cli.ts                   # Root command, global flags, run(), error routing
├── output.ts                # writeOutput, emitEvent, resolveOutputFormat, schemas
└── commands/
    ├── init/
    │   └── command.ts       # axm init (args + flags + handler in one file)
    ├── auth/
    │   ├── command.ts       # axm auth (parent, composes subcommands)
    │   ├── login.ts
    │   ├── logout.ts
    │   ├── whoami.ts
    │   └── token.ts
    ├── skills/
    │   ├── command.ts       # axm skills (parent)
    │   ├── install.ts       # args, flags, handler, output schema, text renderer
    │   ├── uninstall.ts
    │   ├── list.ts
    │   ├── update.ts
    │   ├── new.ts
    │   ├── fork.ts
    │   ├── publish.ts
    │   ├── enable.ts
    │   ├── disable.ts
    │   └── rename.ts
    ├── packs/
    │   ├── command.ts
    │   ├── install.ts
    │   ├── uninstall.ts
    │   ├── new.ts
    │   ├── add.ts
    │   ├── remove.ts
    │   ├── publish.ts
    │   └── unpack.ts
    ├── commands/
    │   ├── command.ts
    │   ├── install.ts
    │   └── uninstall.ts
    └── mcp-servers/
        ├── command.ts
        ├── install.ts
        └── uninstall.ts
```

---

## Phase 1: Foundation — Output System + Global Flags + Error Routing

Establish the infrastructure that all commands depend on before migrating any
commands. No command behavior changes in this phase.

### Tasks

- [ ] **1.1 Create `output.ts`** — Port from `cli-spike/src/output.ts`:
  - `OutputFormat` type (`"text" | "json" | "stream-json"`)
  - `resolveOutputFormat(explicit, isLongRunning?)` — TTY auto-detection
  - `writeOutput(format, schema, data, textRenderer)` — Schema-encoded output
  - `emitEvent(event)` — NDJSON event emitter for `stream-json`
  - NDJSON event schemas: `ProgressEventSchema`, `LogEventSchema`, `ErrorEventSchema`

- [ ] **1.2 Add `--output-format` global flag** — Add to `main-effect-cli.ts`
      global flags section:

  ```typescript
  export const outputFormatFlag = GlobalFlag.setting("axm-output-format")({
    flag: Flag.choice("output-format", ["text", "json", "stream-json"] as const).pipe(
      Flag.withDescription("Output format (default: auto-detect from TTY)"),
      Flag.optional,
    ),
  });
  ```

  Add to `axmGlobalFlags` array. Export it — leaf command handlers yield it.

  **Decision: `--verbose` and `--debug`** — These flags aren't in the design
  guide but serve a real purpose (diagnostic verbosity). Keep them as global
  flags but evaluate whether they should be subsumed by `--output-format text` +
  log levels in a later phase.

- [ ] **1.3 Add pre-Effect format detection** — Add `resolveFormatFromArgv()`
      outside the Effect runtime (per spike pattern) so CLI parsing errors can be
      routed to the correct channel:

  ```typescript
  const resolveFormatFromArgv = (args: ReadonlyArray<string>): OutputFormat => {
    const idx = args.indexOf("--output-format");
    if (idx !== -1 && idx + 1 < args.length) {
      const value = args[idx + 1];
      if (value === "json" || value === "stream-json" || value === "text") return value;
    }
    return process.stdout.isTTY ? "text" : "json";
  };
  ```

- [ ] **1.4 Add three-channel error handling** — Replace the current catch block
      in `runEffectCli()` with format-aware error routing (per spike `handleError`):

  | Channel   | text mode              | json/stream-json mode                 |
  | --------- | ---------------------- | ------------------------------------- |
  | stdout    | —                      | Typed error JSON                      |
  | stderr    | Human-readable message | Brief human message                   |
  | Exit code | 2 (usage), 1 (runtime) | 2 (usage), 1 (runtime), 4 (cancelled) |

  Map `CliError` fields (`code`, `what`, `details`, `howToFix`) to the
  structured error JSON shape. Map `PromptCancelled` to exit code 4.

- [ ] **1.5 Add graceful shutdown** — Add `withGracefulShutdown()` wrapper (from
      spike) to the `run()` boundary:
  - `Effect.forkChild` (supervised fiber)
  - SIGTERM/SIGINT → interrupt fiber with 5s timeout → `process.exit(130)`
  - Clean up listeners after normal completion

- [ ] **1.6 Verify existing E2E tests pass** — All existing behavior unchanged;
      foundation is additive only.

---

## Phase 2: Unified Runtime — Eliminate Double Boot

Merge the two execution paths into one. Commands become Effect programs that run
within the CLI framework's context, receiving services from a single layer
provision.

### Tasks

- [ ] **2.1 Create `cli.ts`** — Extract from `main-effect-cli.ts` into a new
      file containing:
  - Root command definition
  - Global flags
  - `run()` function with error routing, graceful shutdown, layer provision
  - Update `main.ts` to call `run()` from `cli.ts`

  Target `run()` shape:

  ```typescript
  const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
    const format = resolveFormatFromArgv(args);
    try {
      await Effect.runPromise(
        withGracefulShutdown(
          Command.runWith(rootCommand, { version })(args).pipe(
            Effect.provide(appLayer),
          ) as Effect.Effect<void>,
        ),
      );
    } catch (error) {
      handleError(error, format);
    }
  };
  ```

- [ ] **2.2 Consolidate layer provision** — Build a single `appLayer` provided
      once at the `run()` boundary in `cli.ts`, replacing the dual provision
      (`NodeServices.layer` in `runEffectCli()` + `ManagedRuntime.make(AppLayer)` in
      `runtime/index.ts`). The `appLayer` composes:
  - `NodeServices.layer` — FileSystem, Path
  - `FetchHttpClient.layer` — HTTP
  - Auth layers (CredentialStore, AuthClient, AuthMiddleware)
  - `ClackLive` — Prompt/log/spinner services
  - `CliFlags` layer — Resolved from global flags
  - `TelemetryClient` layer
  - `CliEnvConfig` layer

- [ ] **2.3 Wire global flags directly to CliFlags service** — Global flags feed
      into the `CliFlags` layer without the `extractFlags(argv)` bridge:

  ```typescript
  const cliFlagsFromGlobalFlags = Effect.gen(function* () {
    const nonInteractive = yield* nonInteractiveFlag;
    const yes = yield* yesFlag;
    const force = yield* forceFlag;
    const preview = yield* previewFlag;
    return { nonInteractive, yes, force, preview };
  });
  ```

  This eliminates `extractFlags()`, `baseArgv`, and the `executeCommand()` bridge.

- [ ] **2.4 Convert Workspace to a scoped layer** — Commands that need
      `Workspace` declare it in their requirements and yield it from context. Provide
      it as a scoped layer that reads scope from the command's flags, rather than
      passing workspace options through `run()`.

- [ ] **2.5 Migrate one pilot command** — Pick a simple command (e.g. `auth
whoami`) and convert it end-to-end to validate the unified runtime works.
      Command handler yields services from Effect context instead of calling `run()`.

- [ ] **2.6 Verify E2E tests pass** — Pilot command works identically. All other
      commands still work via the old path (coexistence during migration).

---

## Phase 3: Migrate Commands to Single-File Pattern

Migrate each command group from the current pattern (definition in
`main-effect-cli.ts` + `command.ts` + `handler.ts`) to the spike pattern
(single-file `Command.make()` with inline handler).

### Migration Pattern

**Before** (3 files):

```
main-effect-cli.ts                        → makeLeafCommand("install", {...}, handler)
cli-commands/skills/install/command.ts     → { handler: async (argv) => { await run(handleInstall(...)) } }
cli-commands/skills/install/handler.ts     → handleInstall = Effect.fn(...)
```

**After** (1-2 files):

```
commands/skills/install.ts                 → Command.make("install", {...}, (config) => Effect.gen(...))
cli-commands/skills/install/handler.ts     → handleInstall (business logic, retained if complex)
```

For simple commands, the handler logic moves directly into the `Command.make()`
callback. For complex commands with substantial business logic, the `handler.ts`
file is retained but called from within the Effect context (no `run()` bridge).

### Per-Command Migration Steps

For each command:

1. Create `commands/<group>/<command>.ts` with:
   - Output schema (with `_version: 1`)
   - Text renderer function
   - `Command.make()` with args, flags, handler
   - Handler follows 3-step pattern: resolve format → do work → writeOutput

2. Update parent `commands/<group>/command.ts` to import from new file

3. Remove the command's entry from `cli.ts` root command definition

4. Remove old `cli-commands/<group>/<command>/command.ts` (the bridge file)

5. Keep `handler.ts` if business logic is substantial — call it from the new
   command file's handler within Effect context

6. Update tests — E2E tests should still pass unchanged; unit tests may need
   layer adjustments

### Output Schema Rules (from cli-design.md)

- Always include `_version: 1`
- All keys always present (use `null`, never omit)
- Bare objects for single-resource, bare arrays for lists
- ISO 8601 timestamps in JSON, human-friendly in text only

### Tasks

Migrate by command group, simplest first:

- [ ] **3.1 Auth commands** — login, logout, whoami, token (simple, few deps)
  - [ ] Create `commands/auth/command.ts` (parent)
  - [ ] Migrate login → `commands/auth/login.ts`
  - [ ] Migrate logout → `commands/auth/logout.ts`
  - [ ] Migrate whoami → `commands/auth/whoami.ts`
  - [ ] Migrate token → `commands/auth/token.ts`
  - [ ] Remove old `cli-commands/auth/` bridge files
  - [ ] Verify E2E tests pass

- [ ] **3.2 Init** — Single command, moderate complexity
  - [ ] Migrate init → `commands/init/command.ts`
  - [ ] Remove old `cli-commands/init/command.ts`
  - [ ] Verify E2E tests pass

- [ ] **3.3 Skills — read-only / simple** — list, enable, disable, rename
  - [ ] Create `commands/skills/command.ts` (parent)
  - [ ] Migrate list → `commands/skills/list.ts`
  - [ ] Migrate enable → `commands/skills/enable.ts`
  - [ ] Migrate disable → `commands/skills/disable.ts`
  - [ ] Migrate rename → `commands/skills/rename.ts`
  - [ ] Remove old `cli-commands/skills/{list,enable,disable,rename}/command.ts`
  - [ ] Verify E2E tests pass

- [ ] **3.4 Skills — complex** — install, uninstall, update, new, fork, publish
  - [ ] Migrate install → `commands/skills/install.ts` (retain handler.ts)
  - [ ] Migrate uninstall → `commands/skills/uninstall.ts` (retain handler.ts)
  - [ ] Migrate update → `commands/skills/update.ts` (retain handler.ts)
  - [ ] Migrate new → `commands/skills/new.ts`
  - [ ] Migrate fork → `commands/skills/fork.ts` (retain handler.ts)
  - [ ] Migrate publish → `commands/skills/publish.ts` (retain handler.ts)
  - [ ] Remove old `cli-commands/skills/{install,uninstall,update,new,fork,publish}/command.ts`
  - [ ] Verify E2E tests pass

- [ ] **3.5 Packs** — install, uninstall, new, add, remove, publish, unpack
  - [ ] Create `commands/packs/command.ts` (parent)
  - [ ] Migrate all pack subcommands to `commands/packs/<command>.ts`
  - [ ] Remove old `cli-commands/packs/` bridge files
  - [ ] Verify E2E tests pass

- [ ] **3.6 Commands** — install, uninstall
  - [ ] Create `commands/commands/command.ts` (parent)
  - [ ] Migrate install → `commands/commands/install.ts`
  - [ ] Migrate uninstall → `commands/commands/uninstall.ts`
  - [ ] Remove old `cli-commands/commands/` bridge files
  - [ ] Verify E2E tests pass

- [ ] **3.7 MCP Servers** — install, uninstall
  - [ ] Create `commands/mcp-servers/command.ts` (parent)
  - [ ] Migrate install → `commands/mcp-servers/install.ts`
  - [ ] Migrate uninstall → `commands/mcp-servers/uninstall.ts`
  - [ ] Remove old `cli-commands/mcp-servers/` bridge files
  - [ ] Verify E2E tests pass

- [ ] **3.8 Remove old scaffolding** — After all commands migrated:
  - [ ] Delete `main-effect-cli.ts`
  - [ ] Delete `makeLeafCommand()`, `makeGroupCommand()`, `executeCommand()`,
        `baseArgv` helpers
  - [ ] Delete `runtime/index.ts` `run()` function and `ManagedRuntime` (replaced
        by `cli.ts` `run()`)
  - [ ] Remove `EffectCliExit` and `isEffectCliExit` signal types
  - [ ] Delete empty `cli-commands/` directory tree

---

## Phase 4: Parent Command Behavior

### Tasks

- [ ] **4.1 Welcome, don't scold** — Current: group commands call
      `showHelpFor()` which shows help and exits 1. Target: parent commands with no
      subcommand show help and exit 0. Effect CLI does this automatically when a
      parent command has no handler — verify this works and remove `showHelpFor()`
      calls. If the built-in help doesn't meet the "welcome" criteria, add a brief
      description + subcommand list as the parent's handler.

- [ ] **4.2 Evaluate top-level shortcuts** — Current CLI registers `login`,
      `logout`, `whoami`, `token` as both top-level commands and under `auth`. Decide
      whether to keep this convenience or consolidate under `auth` only. Document the
      decision.

- [ ] **4.3 Verify exit codes** — Confirm all parent commands exit 0 when
      invoked without subcommands. Add E2E tests if missing.

---

## Phase 5: Clack Integration with Output Modes

### Tasks

- [ ] **5.1 Design mode-aware output adapter** — Clack services should be
      suppressed or redirected in `json`/`stream-json` modes:

  | Clack Service  | text mode        | json/stream-json mode       |
  | -------------- | ---------------- | --------------------------- |
  | `ClackLog`     | Clack formatting | NDJSON log events on stdout |
  | `ClackSpinner` | Animated spinner | NDJSON progress events      |
  | `ClackPrompt`  | Interactive      | Error with flag suggestion  |

  This may require a `ClackOutputAdapter` or mode-aware layer variants.

- [ ] **5.2 Implement mode-aware `ClackLog`** — In `json`/`stream-json` mode,
      `log.info(msg)` emits `{"type":"log","level":"info","message":"..."}` on stdout
      instead of Clack-formatted stderr.

- [ ] **5.3 Implement mode-aware `ClackSpinner`** — In `json`/`stream-json`
      mode, `withSpinner()` emits NDJSON progress events instead of rendering an
      animated spinner.

- [ ] **5.4 Implement mode-aware `ClackPrompt`** — In `json`/`stream-json` mode,
      prompts fail with `CliError` code `PROMPT_IN_STRUCTURED_OUTPUT`, suggesting the
      equivalent flag.

- [ ] **5.5 Update command handlers for dual-mode** — Commands that use Clack
      services work transparently in both modes via the adapter. For commands with
      significantly different flows, use explicit format branching:

  ```typescript
  (config) =>
    Effect.gen(function* () {
      const format = resolveOutputFormat(yield* outputFormatFlag);
      if (format === "text") {
        // Interactive path: ClackSpinner, ClackLog
      } else {
        // Structured path: NDJSON events
      }
    });
  ```

- [ ] **5.6 Verify structured output E2E** — Add tests confirming that
      `--output-format json` produces valid JSON and `--output-format stream-json`
      produces valid NDJSON for commands that use Clack services.

---

## Phase 6: Cleanup and Validation

### Tasks

- [ ] **6.1 Remove dead code** — Audit and delete:
  - Empty `cli-commands/` directory tree (if not already removed in 3.8)
  - `extractFlags()` utility
  - Unused runtime exports (`ManagedRuntime`, `withCliRuntime` overloads)
  - `EffectCliExit` / `isEffectCliExit` (if not already removed in 3.8)
  - Any orphaned test utilities or fixtures

- [ ] **6.2 Update imports** — All command imports reference `commands/` not
      `cli-commands/`. Update barrel files and any cross-references.

- [ ] **6.3 Validate against cli-design.md checklists** — Run through every
      checklist:
  - [ ] Architecture Checklist (§ Effect CLI + Effect Architecture)
  - [ ] Command Naming Checklist (§ Command Structure and Naming)
  - [ ] File Organization Checklist (§ Command File Organization)
  - [ ] Parent Command Checklist (§ Parent Command Behavior)
  - [ ] Standard Flags Checklist (§ Standard Flags)
  - [ ] Structured Output Checklist (§ Structured Output Contracts)
  - [ ] Error Handling Checklist (§ Three-Channel Error Pattern)
  - [ ] Process Lifecycle Checklist (§ Process Lifecycle and IPC)
  - [ ] Interactive Prompts Checklist (§ Interactive Prompts)
  - [ ] Output Checklist (§ Output Conventions)
  - [ ] Anti-Patterns Checklist (§ Anti-Patterns)

- [ ] **6.4 Add structured output E2E tests** — Ensure coverage for:
  - `--output-format json` produces valid JSON with `_version`
  - `--output-format stream-json` produces valid NDJSON
  - Exit codes match spec (0, 1, 2, 4, 130)
  - Errors appear on correct channels per format
  - `--non-interactive` + structured output works for CI

- [ ] **6.5 Run full test suite** — `pnpm test`, `pnpm test:e2e`, `pnpm
typecheck`, `pnpm lint` all pass.

---

## Risk Mitigations

| Risk                                       | Mitigation                                                |
| ------------------------------------------ | --------------------------------------------------------- |
| Breaking existing CLI behavior             | E2E tests gate each phase; `text` mode behavior unchanged |
| Handler.ts files have complex service deps | Keep handler.ts files; only change how they're called     |
| ManagedRuntime lifecycle differences       | Test resource cleanup (auth, HTTP) explicitly             |
| Large diff size                            | Migrate one command group at a time within Phase 3        |
| Output schema design churn                 | Start with `_version: 1`, additive-only changes           |
