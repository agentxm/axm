> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 0. Spike Schema AST — SKIPPED

Phase 3 was completed successfully without the spike, validating the Schema AST approach through direct implementation. No further action needed.

## 1. Verbosity Service — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: none (can run in parallel with Phase 0).

Create the standalone Verbosity service, layer, and conditional emission helpers.

- [x] 1.1 Write tests for `Verbosity` service: `isAtLeast` level ordering, `makeVerbosityLayer` construction, and `verbosityToLogLevel` mapping in `packages/core/src/unstable/verbosity/verbosity.test.ts`
- [x] 1.2 Write tests for conditional helpers (`whenNotQuiet`, `whenVerbose`, `whenDebug`) in `packages/core/src/unstable/verbosity/helpers.test.ts`
- [x] 1.3 Implement `VerbosityLevel` type, `LevelOrder`, `Verbosity` service, `makeVerbosityLayer`, and `verbosityToLogLevel` in `packages/core/src/unstable/verbosity/verbosity.ts`
- [x] 1.4 Implement `whenNotQuiet`, `whenVerbose`, `whenDebug` helpers in `packages/core/src/unstable/verbosity/helpers.ts`
- [x] 1.5 Create barrel `packages/core/src/unstable/verbosity/index.ts`
- [x] 1.6 Add `./unstable/verbosity` export to `packages/core/package.json`
- [x] 1.7 Run `pnpm typecheck` and fix any errors
- [x] 1.8 Run `pnpm lint` and fix any errors
- [x] 1.9 Run `pnpm test` and fix any failures
- [x] 1.10 Kill any vitest worker processes

## 2. CLI Flags Updates — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (Verbosity types used by flag resolution).

Add `quietFlag` and `jsonFlag`. Add `resolveVerbosityFromArgv`.

- [x] 2.1 Write tests for `resolveVerbosityFromArgv` (last-flag-wins semantics, `-q`, `-v`, `-vv`, `--debug`, `--quiet`, `--verbose`, combined flags) in `packages/core/src/unstable/cli-flags/resolve-verbosity.test.ts`
- [x] 2.2 Add `quietFlag` global flag and `jsonFlag` per-command flag to `packages/core/src/unstable/cli-flags/index.ts`
- [x] 2.3 Implement `resolveVerbosityFromArgv` in `packages/core/src/unstable/cli-flags/resolve-verbosity.ts`
- [x] 2.4 Run `pnpm typecheck` and fix any errors
- [x] 2.5 Run `pnpm lint` and fix any errors
- [x] 2.6 Run `pnpm test` and fix any failures
- [x] 2.7 Kill any vitest worker processes

## 3. CliRenderer Service Definition and Types — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 0 (spike validates Schema AST approach).

Define the CliRenderer service interface, all supporting types, schema annotations, and column derivation utilities.

- [x] 3.1 Write tests for `column()` and `hidden()` annotation helpers in `packages/core/src/unstable/cli-renderer/annotations.test.ts`
- [x] 3.2 Write tests for `columnsFrom()` using the validated spike patterns in `packages/core/src/unstable/cli-renderer/command-output.test.ts`
- [x] 3.3 Write tests for `emitMany` and `emitOne` helpers in the same test file — verify they call `result()` then `table()`/`detail()` with correct args, and short-circuit when `result()` returns `true`
- [x] 3.4 Implement `CliRenderer` service definition and all supporting types (`SpinnerHandle`, `SpinnerOptions`, `ProgressHandle`, `ProgressConfig`, `TaskLogConfig`, `TaskLogHandle`, `TaskLogGroupHandle`, `Task`, `LogLevel`, `LogMessage`, `ColumnDef`, `TreeNode`, `TreeDef`, `BoxOptions`) in `packages/core/src/unstable/cli-renderer/cli-renderer.ts`
- [x] 3.5 Implement `TerminalCapabilities` type and `resolveTerminalCapabilities` in `packages/core/src/unstable/cli-renderer/terminal-capabilities.ts`
- [x] 3.6 Implement annotation symbols and `column()`, `hidden()` helpers in `packages/core/src/unstable/cli-renderer/annotations.ts`
- [x] 3.7 Implement `columnsFrom()`, `emitMany()`, `emitOne()`, `CommandOutputOpts` in `packages/core/src/unstable/cli-renderer/command-output.ts` — migrate from spike, remove spike file
- [x] 3.8 Create barrel `packages/core/src/unstable/cli-renderer/index.ts`
- [x] 3.9 Add `./unstable/cli-renderer` export to `packages/core/package.json`
- [x] 3.10 Run `pnpm typecheck` and fix any errors
- [x] 3.11 Run `pnpm lint` and fix any errors
- [x] 3.12 Run `pnpm test` and fix any failures
- [x] 3.13 Kill any vitest worker processes

## 4. CliRenderer Implementations — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3 (service definition and types).

Implement `InteractiveRenderer`, `MachineRenderer`, and `TestRenderer` layers.

> **Parallelization:** Tasks 4.1-4.4, 4.5-4.8, and 4.9-4.13 are independent — launch as parallel subagents.

- [x] 4.1 Write tests for `InteractiveRenderer` chrome methods (delegates to Clack, stderr channel) in `packages/core/src/unstable/cli-renderer/cli-renderer-interactive.test.ts`
- [x] 4.2 Write tests for `InteractiveRenderer` data display methods (`table`, `detail`, `tree` formatting) in the same test file
- [x] 4.3 Write tests for `InteractiveRenderer` data output methods (`result` returns `false`, `resultStream` returns `false`, `json`/`raw` write to stdout) in the same test file
- [x] 4.4 Implement `InteractiveRenderer` layer in `packages/core/src/unstable/cli-renderer/cli-renderer-interactive.ts` — Clack chrome on stderr, custom table/tree formatters on stdout, `result()` returns `false`
- [x] 4.5 Write tests for `MachineRenderer` — chrome methods emit NDJSON to stderr, data display methods are no-ops, `result()` validates via schema and writes JSON to stdout returning `true`, `resultStream()` writes NDJSON to stdout in `packages/core/src/unstable/cli-renderer/cli-renderer-machine.test.ts`
- [x] 4.6 Implement `MachineRenderer` layer in `packages/core/src/unstable/cli-renderer/cli-renderer-machine.ts`
- [x] 4.7 Write tests for `TestRenderer` — captures all calls to `TestRendererState`, `result()` returns `false` by default in `packages/core/src/unstable/cli-renderer/cli-renderer-test.test.ts`
- [x] 4.8 Write tests for `TestMachineRenderer` — same capture plus `result()` returns `true` in the same test file
- [x] 4.9 Implement `TestRenderer`, `TestMachineRenderer`, and `TestRendererState` in `packages/core/src/unstable/cli-renderer/cli-renderer-test.ts`
- [x] 4.10 Update barrel `packages/core/src/unstable/cli-renderer/index.ts` with all new exports
- [x] 4.11 Run `pnpm typecheck` and fix any errors
- [x] 4.12 Run `pnpm lint` and fix any errors
- [x] 4.13 Run `pnpm test` and fix any failures
- [x] 4.14 Run `pnpm test:e2e` and fix any failures
- [x] 4.15 Kill any vitest worker processes

## 5. CliPrompt Service — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: none (can run in parallel with Phases 0-4).

Rename Input to CliPrompt. Add `fromFlagOrPrompt` and `autoConfirm` helpers. Create TestPrompt.

- [x] 5.1 Write tests for `fromFlagOrPrompt` and `autoConfirm` in `packages/core/src/unstable/cli-prompt/helpers.test.ts`
- [x] 5.2 Write tests for `TestPrompt` — canned responses, call recording, empty queue failure in `packages/core/src/unstable/cli-prompt/cli-prompt-test.test.ts`
- [x] 5.3 Write tests for `resolveNonInteractive` (flag → CI → TTY resolution chain) in `packages/core/src/unstable/cli-prompt/resolve-non-interactive.test.ts`
- [x] 5.4 Define `CliPrompt` service and config types (`TextOpts`, `ConfirmOpts`, `SelectOpts`, `MultiselectOpts`, `GroupMultiselectOpts`, `SelectKeyOpts`, `AutocompleteOpts`, `AutocompleteMultiselectOpts`, `PasswordOpts`, `PathOpts`) in `packages/core/src/unstable/cli-prompt/cli-prompt.ts`
- [x] 5.5 Implement `InteractivePrompt` layer (Clack prompts, non-interactive fail-fast) in `packages/core/src/unstable/cli-prompt/cli-prompt-interactive.ts`
- [x] 5.6 Implement `TestPrompt`, `TestPromptConfig`, `TestPromptState` in `packages/core/src/unstable/cli-prompt/cli-prompt-test.ts`
- [x] 5.7 Implement `fromFlagOrPrompt` and `autoConfirm` in `packages/core/src/unstable/cli-prompt/helpers.ts`
- [x] 5.8 Implement `nonInteractiveFlag` and `resolveNonInteractive` in `packages/core/src/unstable/cli-prompt/resolve-non-interactive.ts`
- [x] 5.9 Create barrel `packages/core/src/unstable/cli-prompt/index.ts`
- [x] 5.10 Add `./unstable/cli-prompt` export to `packages/core/package.json`
- [x] 5.11 Run `pnpm typecheck` and fix any errors
- [x] 5.12 Run `pnpm lint` and fix any errors
- [x] 5.13 Run `pnpm test` and fix any failures
- [x] 5.14 Kill any vitest worker processes

## 6. CLI Runtime Integration — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 1, 2, 3, 4, 5 (all new services must exist).

Wire new services into the CLI runtime. Update `makeFoundationLayer`, layer selection, and error handling.

- [x] 6.1 Write tests for updated `makeFoundationLayer` — verifies it provides `CliRenderer | CliPrompt | Verbosity` based on `{ json, terminalCapabilities }` options in `packages/core/src/unstable/cli-runtime/runtime-envelope.test.ts` (or co-located test)
- [x] 6.2 Update `makeFoundationLayer` in `packages/core/src/unstable/cli-runtime/` to accept `{ json, terminalCapabilities }` and provide `CliRenderer | CliPrompt | Verbosity` alongside existing `Output | Activity | Input | CliEnvironment` (dual-provide for backward compatibility)
- [x] 6.3 Add `resolveVerbosityFromArgv` call at the `run()` boundary in `packages/core/src/unstable/cli-runtime/run-cli-main.ts` (or equivalent entry point) to construct `makeVerbosityLayer`
- [x] 6.4 Add `resolveTerminalCapabilities` call at the `run()` boundary for renderer layer selection
- [x] 6.5 Update `withCliErrorHandling` to read `Verbosity` instead of `verboseFlag`/`debugFlag` directly
- [x] 6.6 Run `pnpm typecheck` and fix any errors
- [x] 6.7 Run `pnpm lint` and fix any errors
- [x] 6.8 Run `pnpm test` and fix any failures
- [x] 6.9 Run `pnpm test:e2e` and fix any failures
- [x] 6.10 Kill any vitest worker processes

## 7. Adapter Layers — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 6 (runtime provides both old and new services).

Implement `Output` and `Activity` as thin wrappers over `CliRenderer`, and `Input` as a re-export of `CliPrompt`. Existing handlers continue working unchanged.

- [x] 7.1 Write tests verifying the Output adapter delegates all methods to CliRenderer correctly
- [x] 7.2 Write tests verifying the Activity adapter delegates spinner/progress/taskLog/runTasks to CliRenderer correctly
- [x] 7.3 Write tests verifying the Input adapter delegates all prompt methods to CliPrompt correctly
- [x] 7.4 Implement Output adapter layer — thin wrapper that translates `Output` method calls to `CliRenderer` calls
- [x] 7.5 Implement Activity adapter layer — thin wrapper that translates `Activity` method calls to `CliRenderer` calls
- [x] 7.6 Implement Input adapter layer — thin wrapper that translates `Input` method calls to `CliPrompt` calls
- [x] 7.7 Wire adapter layers into `makeFoundationLayer` so existing handlers get adapters backed by new services
- [x] 7.8 Run `pnpm typecheck` and fix any errors
- [x] 7.9 Run `pnpm lint` and fix any errors
- [x] 7.10 Run `pnpm test` and fix any failures
- [x] 7.11 Run `pnpm test:e2e` and fix any failures — this validates all existing handlers still work through the adapters
- [x] 7.12 Kill any vitest worker processes

## 8. Migrate Auth Handlers — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7 (adapters ensure non-migrated handlers still work).

Migrate auth command handlers from `Output`/`Activity`/`Input` to `CliRenderer`/`CliPrompt`. Add output schemas and `--json` flag where applicable.

> **Note:** `token` handler does not use Output/Activity/Input — no migration needed.

- [x] 8.1 Migrate `whoami` handler: update imports, add output schema, add `--json` flag, use `emitOne`
- [x] 8.2 Update `whoami` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 8.3 Migrate `login` handler: update imports, use `CliRenderer` + `CliPrompt`
- [x] 8.4 Update `login` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 8.5 Migrate `logout` handler: update imports, use `CliRenderer`
- [x] 8.6 Update `logout` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 8.7 Run `pnpm typecheck` and fix any errors
- [x] 8.8 Run `pnpm lint` and fix any errors
- [x] 8.9 Run `pnpm test` and fix any failures
- [x] 8.10 Run `pnpm test:e2e` and fix any failures
- [x] 8.11 Kill any vitest worker processes

## 9. Migrate Init Handler — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7.

- [x] 9.1 Migrate `init` handler: update imports, use `CliRenderer` + `CliPrompt`, add grouped tree for created/skipped files, add output schema
- [x] 9.2 Update `init` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 9.3 Run `pnpm typecheck` and fix any errors
- [x] 9.4 Run `pnpm lint` and fix any errors
- [x] 9.5 Run `pnpm test` and fix any failures
- [x] 9.6 Run `pnpm test:e2e` and fix any failures
- [x] 9.7 Kill any vitest worker processes

## 10. Migrate Skills Handlers — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7.

- [x] 10.1 Migrate `skills list` handler: add output schema with column annotations, add `--json` flag, use `emitMany`
- [x] 10.2 Update `skills list` handler tests to use `TestRenderer`
- [x] 10.3 Migrate `skills install` handler + `select-skills` + `plan`: use `CliRenderer` for spinner/progress, add output schema
- [x] 10.4 Update `skills install` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 10.5 Migrate `skills uninstall` handler: use `CliRenderer`
- [x] 10.6 Update `skills uninstall` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 10.7 Migrate `skills new` handler: use `CliRenderer` + `CliPrompt`
- [x] 10.8 Update `skills new` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 10.9 Migrate `skills enable` handler: use `CliRenderer`
- [x] 10.10 Update `skills enable` handler tests to use `TestRenderer`
- [x] 10.11 Migrate `skills disable` handler: use `CliRenderer`
- [x] 10.12 Update `skills disable` handler tests to use `TestRenderer`
- [x] 10.13 Migrate `skills fork` handler: use `CliRenderer` + `CliPrompt`
- [x] 10.14 Update `skills fork` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 10.15 Migrate `skills rename` handler: use `CliRenderer` + `CliPrompt`
- [x] 10.16 Update `skills rename` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 10.17 Migrate `skills update` handler: use `CliRenderer`
- [x] 10.18 Migrate `skills publish` handler: use `CliRenderer` + `CliPrompt`
- [x] 10.19 Update `skills publish` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 10.20 Run `pnpm typecheck` and fix any errors
- [x] 10.21 Run `pnpm lint` and fix any errors
- [x] 10.22 Run `pnpm test` and fix any failures
- [x] 10.23 Run `pnpm test:e2e` and fix any failures
- [x] 10.24 Kill any vitest worker processes

## 11. Migrate Packs Handlers — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7.

- [x] 11.1 Migrate `packs install` handler + `plan` + `command-actions`: use `CliRenderer` for spinner/progress, add output schema
- [x] 11.2 Update `packs install` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 11.3 Migrate `packs uninstall` handler + `plan` + `command-actions`: use `CliRenderer`
- [x] 11.4 Update `packs uninstall` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 11.5 Migrate `packs new` handler: use `CliRenderer` + `CliPrompt`
- [x] 11.6 Update `packs new` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 11.7 Migrate `packs add` handler: use `CliRenderer` + `CliPrompt`
- [x] 11.8 Update `packs add` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 11.9 Migrate `packs remove` handler: use `CliRenderer`
- [x] 11.10 Update `packs remove` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 11.11 Migrate `packs publish` handler: use `CliRenderer` + `CliPrompt`
- [x] 11.12 Update `packs publish` handler tests to use `TestRenderer`/`TestPrompt`
- [x] 11.13 Migrate `packs unpack` handler: use `CliRenderer`
- [x] 11.14 Update `packs unpack` handler tests to use `TestRenderer`
- [x] 11.15 Run `pnpm typecheck` and fix any errors
- [x] 11.16 Run `pnpm lint` and fix any errors
- [x] 11.17 Run `pnpm test` and fix any failures
- [x] 11.18 Run `pnpm test:e2e` and fix any failures
- [x] 11.19 Kill any vitest worker processes

## 12. Migrate Commands and MCP Servers Handlers — DONE

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7.

> **Note:** `commands uninstall` and `mcp-servers uninstall` don't use Output/Activity/Input — no migration needed.

- [x] 12.1 Migrate `commands install` handler: use `CliPrompt`
- [x] 12.2 Update `commands install` handler tests to use `TestPrompt`
- [x] 12.3 Migrate `mcp-servers install` handler: use `CliPrompt`
- [x] 12.4 Update `mcp-servers install` handler tests to use `TestPrompt`
- [x] 12.5 Run `pnpm typecheck` and fix any errors
- [x] 12.6 Run `pnpm lint` and fix any errors
- [x] 12.7 Run `pnpm test` and fix any failures
- [x] 12.8 Run `pnpm test:e2e` and fix any failures
- [x] 12.9 Kill any vitest worker processes

## 13. Migrate Shared Services (Transitive Dependencies)

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 3, 4, 5 (CliRenderer and CliPrompt services must exist).

> **Gap identified during WIP analysis:** 18 non-handler production files still use `Output`/`Activity`/`Input` directly. These are transitive dependencies called by handlers — they must be migrated before old services can be removed. Handler tests currently provide adapter layers to satisfy these; once this phase completes, those adapter imports become unnecessary.

### 13a. Migrate Core Shared Services

These files are called transitively by many handlers and are the reason handler tests still need adapter layers.

> **Parallelization:** 13.1-13.2, 13.3-13.4, 13.5 are independent — launch as parallel subagents.

- [x] 13.1 Migrate `auth/guard.ts`: replace `yield* Output`, `yield* Input`, `yield* Activity` with `CliRenderer` + `CliPrompt`
- [x] 13.2 Update `auth/guard` tests if they exist
- [x] 13.3 Migrate `workspace/service.ts`: replace `yield* Output`, `yield* Input` with `CliRenderer` + `CliPrompt`
- [x] 13.4 Migrate `workspace/initialization.ts`: replace `yield* Output`, `yield* Input` with `CliRenderer` + `CliPrompt`
- [x] 13.5 Migrate `workspace/display-plan.ts`: replace `yield* Output` with `CliRenderer`

### 13b. Migrate Extension Operations

> **Parallelization:** All tasks in 13b are independent — launch as parallel subagents.

- [x] 13.6 Migrate `extensions/skills/operations/install.ts`: replace `yield* Output` with `CliRenderer`
- [x] 13.7 Migrate `extensions/packs/operations/install.ts`: replace `yield* Output` with `CliRenderer`
- [x] 13.8 Migrate `extensions/packs/operations/uninstall.ts`: replace `yield* Output` with `CliRenderer`
- [x] 13.9 Migrate `extensions/mcp-servers/operations/install.ts`: replace `yield* Output` with `CliRenderer`
- [x] 13.10 Migrate `extensions/mcp-servers/operations/uninstall.ts`: replace `yield* Output` with `CliRenderer`
- [x] 13.11 Migrate `extensions/commands/operations/install.ts`: replace `yield* Output` with `CliRenderer`

### 13c. Remove Adapter Imports from Handler Tests

Once all transitive dependencies are migrated, handler tests no longer need adapter layers. Update all 26 test files to remove `OutputAdapter`, `ActivityAdapter`, and `InputAdapter` imports and layer wiring.

- [x] 13.12 Remove adapter imports from auth handler tests (`login`, `logout`, `whoami`)
- [x] 13.13 Remove adapter imports from init handler tests
- [x] 13.14 Remove adapter imports from skills handler tests (`list`, `install`, `uninstall`, `new`, `enable`, `disable`, `fork`, `rename`, `publish`, `select-skills`, `plan`)
- [x] 13.15 Remove adapter imports from packs handler tests (`install`, `uninstall`, `new`, `add`, `remove`, `publish`, `unpack`, `plan`)
- [x] 13.16 Remove adapter imports from commands/mcp-servers handler tests

### 13d. Migrate Dev TUI Commands (Lower Priority)

- [x] 13.17 Migrate `dev-cli-commands/tui/log/command.ts`: replace `yield* Output` with `CliRenderer`
- [x] 13.18 Migrate `dev-cli-commands/tui/note/command.ts`: replace `yield* Output` with `CliRenderer`
- [x] 13.19 Migrate `dev-cli-commands/tui/spinner/command.ts`: replace `yield* Activity` with `CliRenderer`
- [x] 13.20 Migrate `dev-cli-commands/tui/text-input/command.ts`: replace `yield* Input`, `yield* Output` with `CliPrompt`, `CliRenderer`
- [x] 13.21 Migrate `dev-cli-commands/tui/password-input/command.ts`: replace `yield* Input`, `yield* Output` with `CliPrompt`, `CliRenderer`
- [x] 13.22 Migrate `dev-cli-commands/tui/confirm/command.ts`: replace `yield* Input`, `yield* Output` with `CliPrompt`, `CliRenderer`
- [x] 13.23 Migrate `dev-cli-commands/tui/select/command.ts`: replace `yield* Input`, `yield* Output` with `CliPrompt`, `CliRenderer`
- [x] 13.24 Migrate `dev-cli-commands/tui/multiselect/command.ts`: replace `yield* Input`, `yield* Output` with `CliPrompt`, `CliRenderer`

### 13e. Verification

- [x] 13.25 Verify no remaining `yield* Output`, `yield* Activity`, `yield* Input` in any production `.ts` file (excluding adapters themselves)
- [x] 13.26 Run `pnpm typecheck` and fix any errors
- [x] 13.27 Run `pnpm lint` and fix any errors
- [x] 13.28 Run `pnpm test` and fix any failures
- [x] 13.29 Run `pnpm test:e2e` and fix any failures
- [x] 13.30 Kill any vitest worker processes

## 14. Remove Old Services and Adapters

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 13 (all consumers of old services must be migrated).

Remove the adapter layers, old service definitions, CliEnvironment, output-format, and old test infrastructure.

- [x] 14.1 Verify no remaining imports of `Output`, `Activity`, `Input`, or `CliEnvironment` anywhere in the codebase (grep — should only find adapter files and old service definitions)
- [x] 14.2 Remove adapter layers created in Phase 7 (`output-adapter.ts`, `activity-adapter.ts`, `input-adapter.ts` and their tests)
- [ ] 14.3 Remove `packages/core/src/unstable/output/` directory (Output service, OutputLive, OutputStructured, output tests)
- [ ] 14.4 Remove `packages/core/src/unstable/activity/` directory (Activity service, ActivityLive, ActivityStructured, activity tests)
- [ ] 14.5 Remove `packages/core/src/unstable/input/` directory (Input service, InputLive, InputStructured, input tests)
- [ ] 14.6 Remove `packages/core/src/unstable/output-format.ts` — relocate any NDJSON event schemas still needed to `cli-renderer/`
- [ ] 14.7 Remove `CliEnvironment`, `makeCliEnvironmentLayer`, `CliEnvironmentTest` from `packages/core/src/unstable/cli-flags/index.ts`
- [ ] 14.8 Remove `outputFormatFlag` from `packages/core/src/unstable/cli-flags/index.ts`
- [x] 14.9 Remove `makeUiLayer` from `packages/core/src/unstable/cli-runtime/ui-layer.ts`
- [ ] 14.10 Remove `resolveFormat`, `resolveCliFormat` from `packages/core/src/unstable/cli-runtime/resolve-format.ts`
- [ ] 14.11 Remove `packages/cli/src/output.ts` (re-export barrel for output-format)
- [ ] 14.12 Remove old package.json exports: `./unstable/output-format`, `./unstable/output`, `./unstable/activity`, `./unstable/input`
- [x] 14.13 Update `makeFoundationLayer` to stop dual-providing old services — provide only `CliRenderer | CliPrompt | Verbosity`
- [ ] 14.14 Run `pnpm typecheck` and fix any errors
- [ ] 14.15 Run `pnpm lint` and fix any errors
- [ ] 14.16 Run `pnpm test` and fix any failures
- [ ] 14.17 Run `pnpm test:e2e` and fix any failures
- [ ] 14.18 Kill any vitest worker processes

## 15. Final Validation

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 14.

Full-suite verification and cleanup.

- [ ] 15.1 Run `pnpm build` — verify clean build with no old service references
- [ ] 15.2 Run `pnpm typecheck` — verify no type errors across all packages
- [ ] 15.3 Run `pnpm lint` — verify no lint warnings or errors
- [ ] 15.4 Run `pnpm test` — verify all unit tests pass
- [ ] 15.5 Run `pnpm test:e2e` — verify all E2E tests pass
- [ ] 15.6 Verify no remaining references to removed symbols: `OutputLive`, `OutputStructured`, `ActivityLive`, `ActivityStructured`, `InputLive`, `InputStructured`, `makeOutputTestLayer`, `makeActivityTestLayer`, `makeInputTestLayer`, `CliEnvironment`, `outputFormatFlag`, `makeUiLayer`
- [ ] 15.7 Kill any vitest worker processes
