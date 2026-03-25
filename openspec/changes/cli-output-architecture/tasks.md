> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 0. Spike Schema AST

> **Subagent:** Run this entire phase in a single subagent.

Validate that Effect v4's `SchemaAST` APIs support the annotation-based column derivation strategy. This gates Phase 1 — if APIs are insufficient, the annotation approach needs redesign.

- [ ] 0.1 Create spike file `packages/core/src/unstable/cli-renderer/spike-schema-ast.test.ts` with test cases exercising `SchemaAST.isObjects`, `SchemaAST.resolve`, and annotation reading on: plain struct fields, `Schema.optional` fields, branded types, enums, nested structs, and piped annotations
- [ ] 0.2 Implement a minimal `columnsFrom` prototype in the spike test file — extract `ColumnHeader`, `ColumnPriority`, `ColumnAlign`, `ColumnWidth`, `DisplayFormat`, and `Hidden` annotations from property signatures
- [ ] 0.3 Verify all spike tests pass; document any API gaps or workarounds needed as comments in the spike file
- [ ] 0.4 Run `pnpm typecheck` and fix any errors
- [ ] 0.5 Run `pnpm lint` and fix any errors
- [ ] 0.6 Run `pnpm test` and fix any failures
- [ ] 0.7 Kill any vitest worker processes

## 1. Verbosity Service

> **Subagent:** Run this entire phase in a single subagent.

Depends on: none (can run in parallel with Phase 0).

Create the standalone Verbosity service, layer, and conditional emission helpers.

- [ ] 1.1 Write tests for `Verbosity` service: `isAtLeast` level ordering, `makeVerbosityLayer` construction, and `verbosityToLogLevel` mapping in `packages/core/src/unstable/verbosity/verbosity.test.ts`
- [ ] 1.2 Write tests for conditional helpers (`whenNotQuiet`, `whenVerbose`, `whenDebug`) in `packages/core/src/unstable/verbosity/helpers.test.ts`
- [ ] 1.3 Implement `VerbosityLevel` type, `LevelOrder`, `Verbosity` service, `makeVerbosityLayer`, and `verbosityToLogLevel` in `packages/core/src/unstable/verbosity/verbosity.ts`
- [ ] 1.4 Implement `whenNotQuiet`, `whenVerbose`, `whenDebug` helpers in `packages/core/src/unstable/verbosity/helpers.ts`
- [ ] 1.5 Create barrel `packages/core/src/unstable/verbosity/index.ts`
- [ ] 1.6 Add `./unstable/verbosity` export to `packages/core/package.json`
- [ ] 1.7 Run `pnpm typecheck` and fix any errors
- [ ] 1.8 Run `pnpm lint` and fix any errors
- [ ] 1.9 Run `pnpm test` and fix any failures
- [ ] 1.10 Kill any vitest worker processes

## 2. CLI Flags Updates

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (Verbosity types used by flag resolution).

Add `quietFlag` and `jsonFlag`. Add `resolveVerbosityFromArgv`.

- [ ] 2.1 Write tests for `resolveVerbosityFromArgv` (last-flag-wins semantics, `-q`, `-v`, `-vv`, `--debug`, `--quiet`, `--verbose`, combined flags) in `packages/core/src/unstable/cli-flags/resolve-verbosity.test.ts`
- [ ] 2.2 Add `quietFlag` global flag and `jsonFlag` per-command flag to `packages/core/src/unstable/cli-flags/index.ts`
- [ ] 2.3 Implement `resolveVerbosityFromArgv` in `packages/core/src/unstable/cli-flags/resolve-verbosity.ts`
- [ ] 2.4 Run `pnpm typecheck` and fix any errors
- [ ] 2.5 Run `pnpm lint` and fix any errors
- [ ] 2.6 Run `pnpm test` and fix any failures
- [ ] 2.7 Kill any vitest worker processes

## 3. CliRenderer Service Definition and Types

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 0 (spike validates Schema AST approach).

Define the CliRenderer service interface, all supporting types, schema annotations, and column derivation utilities.

- [ ] 3.1 Write tests for `column()` and `hidden()` annotation helpers in `packages/core/src/unstable/cli-renderer/annotations.test.ts`
- [ ] 3.2 Write tests for `columnsFrom()` using the validated spike patterns in `packages/core/src/unstable/cli-renderer/command-output.test.ts`
- [ ] 3.3 Write tests for `emitMany` and `emitOne` helpers in the same test file — verify they call `result()` then `table()`/`detail()` with correct args, and short-circuit when `result()` returns `true`
- [ ] 3.4 Implement `CliRenderer` service definition and all supporting types (`SpinnerHandle`, `SpinnerOptions`, `ProgressHandle`, `ProgressConfig`, `TaskLogConfig`, `TaskLogHandle`, `TaskLogGroupHandle`, `Task`, `LogLevel`, `LogMessage`, `ColumnDef`, `TreeNode`, `TreeDef`, `BoxOptions`) in `packages/core/src/unstable/cli-renderer/cli-renderer.ts`
- [ ] 3.5 Implement `TerminalCapabilities` type and `resolveTerminalCapabilities` in `packages/core/src/unstable/cli-renderer/terminal-capabilities.ts`
- [ ] 3.6 Implement annotation symbols and `column()`, `hidden()` helpers in `packages/core/src/unstable/cli-renderer/annotations.ts`
- [ ] 3.7 Implement `columnsFrom()`, `emitMany()`, `emitOne()`, `CommandOutputOpts` in `packages/core/src/unstable/cli-renderer/command-output.ts` — migrate from spike, remove spike file
- [ ] 3.8 Create barrel `packages/core/src/unstable/cli-renderer/index.ts`
- [ ] 3.9 Add `./unstable/cli-renderer` export to `packages/core/package.json`
- [ ] 3.10 Run `pnpm typecheck` and fix any errors
- [ ] 3.11 Run `pnpm lint` and fix any errors
- [ ] 3.12 Run `pnpm test` and fix any failures
- [ ] 3.13 Kill any vitest worker processes

## 4. CliRenderer Implementations

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3 (service definition and types).

Implement `InteractiveRenderer`, `MachineRenderer`, and `TestRenderer` layers.

> **Parallelization:** Tasks 4.1-4.4, 4.5-4.8, and 4.9-4.13 are independent — launch as parallel subagents.

- [ ] 4.1 Write tests for `InteractiveRenderer` chrome methods (delegates to Clack, stderr channel) in `packages/core/src/unstable/cli-renderer/cli-renderer-interactive.test.ts`
- [ ] 4.2 Write tests for `InteractiveRenderer` data display methods (`table`, `detail`, `tree` formatting) in the same test file
- [ ] 4.3 Write tests for `InteractiveRenderer` data output methods (`result` returns `false`, `resultStream` returns `false`, `json`/`raw` write to stdout) in the same test file
- [ ] 4.4 Implement `InteractiveRenderer` layer in `packages/core/src/unstable/cli-renderer/cli-renderer-interactive.ts` — Clack chrome on stderr, custom table/tree formatters on stdout, `result()` returns `false`
- [ ] 4.5 Write tests for `MachineRenderer` — chrome methods emit NDJSON to stderr, data display methods are no-ops, `result()` validates via schema and writes JSON to stdout returning `true`, `resultStream()` writes NDJSON to stdout in `packages/core/src/unstable/cli-renderer/cli-renderer-machine.test.ts`
- [ ] 4.6 Implement `MachineRenderer` layer in `packages/core/src/unstable/cli-renderer/cli-renderer-machine.ts`
- [ ] 4.7 Write tests for `TestRenderer` — captures all calls to `TestRendererState`, `result()` returns `false` by default in `packages/core/src/unstable/cli-renderer/cli-renderer-test.test.ts`
- [ ] 4.8 Write tests for `TestMachineRenderer` — same capture plus `result()` returns `true` in the same test file
- [ ] 4.9 Implement `TestRenderer`, `TestMachineRenderer`, and `TestRendererState` in `packages/core/src/unstable/cli-renderer/cli-renderer-test.ts`
- [ ] 4.10 Update barrel `packages/core/src/unstable/cli-renderer/index.ts` with all new exports
- [ ] 4.11 Run `pnpm typecheck` and fix any errors
- [ ] 4.12 Run `pnpm lint` and fix any errors
- [ ] 4.13 Run `pnpm test` and fix any failures
- [ ] 4.14 Run `pnpm test:e2e` and fix any failures
- [ ] 4.15 Kill any vitest worker processes

## 5. CliPrompt Service

> **Subagent:** Run this entire phase in a single subagent.

Depends on: none (can run in parallel with Phases 0-4).

Rename Input to CliPrompt. Add `fromFlagOrPrompt` and `autoConfirm` helpers. Create TestPrompt.

- [ ] 5.1 Write tests for `fromFlagOrPrompt` and `autoConfirm` in `packages/core/src/unstable/cli-prompt/helpers.test.ts`
- [ ] 5.2 Write tests for `TestPrompt` — canned responses, call recording, empty queue failure in `packages/core/src/unstable/cli-prompt/cli-prompt-test.test.ts`
- [ ] 5.3 Write tests for `resolveNonInteractive` (flag → CI → TTY resolution chain) in `packages/core/src/unstable/cli-prompt/resolve-non-interactive.test.ts`
- [ ] 5.4 Define `CliPrompt` service and config types (`TextOpts`, `ConfirmOpts`, `SelectOpts`, `MultiselectOpts`, `GroupMultiselectOpts`, `SelectKeyOpts`, `AutocompleteOpts`, `AutocompleteMultiselectOpts`, `PasswordOpts`, `PathOpts`) in `packages/core/src/unstable/cli-prompt/cli-prompt.ts`
- [ ] 5.5 Implement `InteractivePrompt` layer (Clack prompts, non-interactive fail-fast) in `packages/core/src/unstable/cli-prompt/cli-prompt-interactive.ts`
- [ ] 5.6 Implement `TestPrompt`, `TestPromptConfig`, `TestPromptState` in `packages/core/src/unstable/cli-prompt/cli-prompt-test.ts`
- [ ] 5.7 Implement `fromFlagOrPrompt` and `autoConfirm` in `packages/core/src/unstable/cli-prompt/helpers.ts`
- [ ] 5.8 Implement `nonInteractiveFlag` and `resolveNonInteractive` in `packages/core/src/unstable/cli-prompt/resolve-non-interactive.ts`
- [ ] 5.9 Create barrel `packages/core/src/unstable/cli-prompt/index.ts`
- [ ] 5.10 Add `./unstable/cli-prompt` export to `packages/core/package.json`
- [ ] 5.11 Run `pnpm typecheck` and fix any errors
- [ ] 5.12 Run `pnpm lint` and fix any errors
- [ ] 5.13 Run `pnpm test` and fix any failures
- [ ] 5.14 Kill any vitest worker processes

## 6. CLI Runtime Integration

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 1, 2, 3, 4, 5 (all new services must exist).

Wire new services into the CLI runtime. Update `makeFoundationLayer`, layer selection, and error handling.

- [ ] 6.1 Write tests for updated `makeFoundationLayer` — verifies it provides `CliRenderer | CliPrompt | Verbosity` based on `{ json, terminalCapabilities }` options in `packages/core/src/unstable/cli-runtime/runtime-envelope.test.ts` (or co-located test)
- [ ] 6.2 Update `makeFoundationLayer` in `packages/core/src/unstable/cli-runtime/` to accept `{ json, terminalCapabilities }` and provide `CliRenderer | CliPrompt | Verbosity` alongside existing `Output | Activity | Input | CliEnvironment` (dual-provide for backward compatibility)
- [ ] 6.3 Add `resolveVerbosityFromArgv` call at the `run()` boundary in `packages/core/src/unstable/cli-runtime/run-cli-main.ts` (or equivalent entry point) to construct `makeVerbosityLayer`
- [ ] 6.4 Add `resolveTerminalCapabilities` call at the `run()` boundary for renderer layer selection
- [ ] 6.5 Update `withCliErrorHandling` to read `Verbosity` instead of `verboseFlag`/`debugFlag` directly
- [ ] 6.6 Run `pnpm typecheck` and fix any errors
- [ ] 6.7 Run `pnpm lint` and fix any errors
- [ ] 6.8 Run `pnpm test` and fix any failures
- [ ] 6.9 Run `pnpm test:e2e` and fix any failures
- [ ] 6.10 Kill any vitest worker processes

## 7. Adapter Layers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 6 (runtime provides both old and new services).

Implement `Output` and `Activity` as thin wrappers over `CliRenderer`, and `Input` as a re-export of `CliPrompt`. Existing handlers continue working unchanged.

- [ ] 7.1 Write tests verifying the Output adapter delegates all methods to CliRenderer correctly
- [ ] 7.2 Write tests verifying the Activity adapter delegates spinner/progress/taskLog/runTasks to CliRenderer correctly
- [ ] 7.3 Write tests verifying the Input adapter delegates all prompt methods to CliPrompt correctly
- [ ] 7.4 Implement Output adapter layer — thin wrapper that translates `Output` method calls to `CliRenderer` calls
- [ ] 7.5 Implement Activity adapter layer — thin wrapper that translates `Activity` method calls to `CliRenderer` calls
- [ ] 7.6 Implement Input adapter layer — thin wrapper that translates `Input` method calls to `CliPrompt` calls
- [ ] 7.7 Wire adapter layers into `makeFoundationLayer` so existing handlers get adapters backed by new services
- [ ] 7.8 Run `pnpm typecheck` and fix any errors
- [ ] 7.9 Run `pnpm lint` and fix any errors
- [ ] 7.10 Run `pnpm test` and fix any failures
- [ ] 7.11 Run `pnpm test:e2e` and fix any failures — this validates all existing handlers still work through the adapters
- [ ] 7.12 Kill any vitest worker processes

## 8. Migrate Auth Handlers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7 (adapters ensure non-migrated handlers still work).

Migrate auth command handlers from `Output`/`Activity`/`Input` to `CliRenderer`/`CliPrompt`. Add output schemas and `--json` flag where applicable.

> **Parallelization:** Tasks 8.1-8.2, 8.3-8.4, 8.5-8.6, 8.7-8.8 are independent — launch as parallel subagents.

- [ ] 8.1 Migrate `whoami` handler: update imports, add output schema, add `--json` flag, use `emitOne`
- [ ] 8.2 Update `whoami` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 8.3 Migrate `login` handler: update imports, use `CliRenderer` + `CliPrompt`
- [ ] 8.4 Update `login` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 8.5 Migrate `logout` handler: update imports, use `CliRenderer`
- [ ] 8.6 Update `logout` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 8.7 Migrate `token` handler: update imports, use `CliRenderer`
- [ ] 8.8 Update `token` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 8.9 Run `pnpm typecheck` and fix any errors
- [ ] 8.10 Run `pnpm lint` and fix any errors
- [ ] 8.11 Run `pnpm test` and fix any failures
- [ ] 8.12 Run `pnpm test:e2e` and fix any failures
- [ ] 8.13 Kill any vitest worker processes

## 9. Migrate Init Handler

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7.

- [ ] 9.1 Migrate `init` handler: update imports, use `CliRenderer` + `CliPrompt`, add grouped tree for created/skipped files, add output schema
- [ ] 9.2 Update `init` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 9.3 Run `pnpm typecheck` and fix any errors
- [ ] 9.4 Run `pnpm lint` and fix any errors
- [ ] 9.5 Run `pnpm test` and fix any failures
- [ ] 9.6 Run `pnpm test:e2e` and fix any failures
- [ ] 9.7 Kill any vitest worker processes

## 10. Migrate Skills Handlers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7.

> **Parallelization:** Tasks 10.1-10.2, 10.3-10.4, 10.5-10.6, 10.7-10.8, 10.9-10.10, 10.11-10.12, 10.13-10.14, 10.15-10.16, 10.17-10.18, 10.19-10.20 are independent — launch as parallel subagents.

- [ ] 10.1 Migrate `skills list` handler: add output schema with column annotations, add `--json` flag, use `emitMany`
- [ ] 10.2 Update `skills list` handler tests to use `TestRenderer`
- [ ] 10.3 Migrate `skills install` handler: use `CliRenderer` for spinner/progress, add output schema
- [ ] 10.4 Update `skills install` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 10.5 Migrate `skills uninstall` handler: use `CliRenderer`
- [ ] 10.6 Update `skills uninstall` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 10.7 Migrate `skills new` handler: use `CliRenderer` + `CliPrompt`
- [ ] 10.8 Update `skills new` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 10.9 Migrate `skills enable` handler: use `CliRenderer`
- [ ] 10.10 Update `skills enable` handler tests to use `TestRenderer`
- [ ] 10.11 Migrate `skills disable` handler: use `CliRenderer`
- [ ] 10.12 Update `skills disable` handler tests to use `TestRenderer`
- [ ] 10.13 Migrate `skills fork` handler: use `CliRenderer` + `CliPrompt`
- [ ] 10.14 Update `skills fork` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 10.15 Migrate `skills rename` handler: use `CliRenderer` + `CliPrompt`
- [ ] 10.16 Update `skills rename` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 10.17 Migrate `skills update` handler: use `CliRenderer`
- [ ] 10.18 Update `skills update` handler tests to use `TestRenderer`
- [ ] 10.19 Migrate `skills publish` handler: use `CliRenderer` + `CliPrompt`
- [ ] 10.20 Update `skills publish` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 10.21 Run `pnpm typecheck` and fix any errors
- [ ] 10.22 Run `pnpm lint` and fix any errors
- [ ] 10.23 Run `pnpm test` and fix any failures
- [ ] 10.24 Run `pnpm test:e2e` and fix any failures
- [ ] 10.25 Kill any vitest worker processes

## 11. Migrate Packs Handlers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7.

> **Parallelization:** Tasks 11.1-11.2, 11.3-11.4, 11.5-11.6, 11.7-11.8, 11.9-11.10, 11.11-11.12, 11.13-11.14 are independent — launch as parallel subagents.

- [ ] 11.1 Migrate `packs install` handler: use `CliRenderer` for spinner/progress, add output schema
- [ ] 11.2 Update `packs install` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 11.3 Migrate `packs uninstall` handler: use `CliRenderer`
- [ ] 11.4 Update `packs uninstall` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 11.5 Migrate `packs new` handler: use `CliRenderer` + `CliPrompt`
- [ ] 11.6 Update `packs new` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 11.7 Migrate `packs add` handler: use `CliRenderer` + `CliPrompt`
- [ ] 11.8 Update `packs add` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 11.9 Migrate `packs remove` handler: use `CliRenderer`
- [ ] 11.10 Update `packs remove` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 11.11 Migrate `packs publish` handler: use `CliRenderer` + `CliPrompt`
- [ ] 11.12 Update `packs publish` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 11.13 Migrate `packs unpack` handler: use `CliRenderer`
- [ ] 11.14 Update `packs unpack` handler tests to use `TestRenderer`
- [ ] 11.15 Run `pnpm typecheck` and fix any errors
- [ ] 11.16 Run `pnpm lint` and fix any errors
- [ ] 11.17 Run `pnpm test` and fix any failures
- [ ] 11.18 Run `pnpm test:e2e` and fix any failures
- [ ] 11.19 Kill any vitest worker processes

## 12. Migrate Commands and MCP Servers Handlers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7.

> **Parallelization:** Tasks 12.1-12.2, 12.3-12.4, 12.5-12.6, 12.7-12.8 are independent — launch as parallel subagents.

- [ ] 12.1 Migrate `commands install` handler: use `CliRenderer` + `CliPrompt`
- [ ] 12.2 Update `commands install` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 12.3 Migrate `commands uninstall` handler: use `CliRenderer`
- [ ] 12.4 Update `commands uninstall` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 12.5 Migrate `mcp-servers install` handler: use `CliRenderer` + `CliPrompt`
- [ ] 12.6 Update `mcp-servers install` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 12.7 Migrate `mcp-servers uninstall` handler: use `CliRenderer`
- [ ] 12.8 Update `mcp-servers uninstall` handler tests to use `TestRenderer`/`TestPrompt`
- [ ] 12.9 Run `pnpm typecheck` and fix any errors
- [ ] 12.10 Run `pnpm lint` and fix any errors
- [ ] 12.11 Run `pnpm test` and fix any failures
- [ ] 12.12 Run `pnpm test:e2e` and fix any failures
- [ ] 12.13 Kill any vitest worker processes

## 13. Remove Old Services and Adapters

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 8, 9, 10, 11, 12 (all handlers must be migrated before removing old services).

Remove the adapter layers, old service definitions, CliEnvironment, output-format, and old test infrastructure.

- [ ] 13.1 Verify no remaining imports of `Output`, `Activity`, `Input`, or `CliEnvironment` in handler code (grep the codebase)
- [ ] 13.2 Remove adapter layers created in Phase 7
- [ ] 13.3 Remove `packages/core/src/unstable/output/` directory (Output service, OutputLive, OutputStructured, output tests)
- [ ] 13.4 Remove `packages/core/src/unstable/activity/` directory (Activity service, ActivityLive, ActivityStructured, activity tests)
- [ ] 13.5 Remove `packages/core/src/unstable/input/` directory (Input service, InputLive, InputStructured, input tests)
- [ ] 13.6 Remove `packages/core/src/unstable/output-format.ts` — relocate any NDJSON event schemas still needed to `cli-renderer/`
- [ ] 13.7 Remove `CliEnvironment`, `makeCliEnvironmentLayer`, `CliEnvironmentTest` from `packages/core/src/unstable/cli-flags/index.ts`
- [ ] 13.8 Remove `outputFormatFlag` from `packages/core/src/unstable/cli-flags/index.ts`
- [ ] 13.9 Remove `makeUiLayer` from `packages/core/src/unstable/cli-runtime/ui-layer.ts`
- [ ] 13.10 Remove `resolveFormat`, `resolveCliFormat` from `packages/core/src/unstable/cli-runtime/resolve-format.ts`
- [ ] 13.11 Remove `packages/cli/src/output.ts` (re-export barrel for output-format)
- [ ] 13.12 Remove old package.json exports: `./unstable/output-format`, `./unstable/output`, `./unstable/activity`, `./unstable/input`
- [ ] 13.13 Update `makeFoundationLayer` to stop dual-providing old services — provide only `CliRenderer | CliPrompt | Verbosity`
- [ ] 13.14 Run `pnpm typecheck` and fix any errors
- [ ] 13.15 Run `pnpm lint` and fix any errors
- [ ] 13.16 Run `pnpm test` and fix any failures
- [ ] 13.17 Run `pnpm test:e2e` and fix any failures
- [ ] 13.18 Kill any vitest worker processes

## 14. Final Validation

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 13.

Full-suite verification and cleanup.

- [ ] 14.1 Run `pnpm build` — verify clean build with no old service references
- [ ] 14.2 Run `pnpm typecheck` — verify no type errors across all packages
- [ ] 14.3 Run `pnpm lint` — verify no lint warnings or errors
- [ ] 14.4 Run `pnpm test` — verify all unit tests pass
- [ ] 14.5 Run `pnpm test:e2e` — verify all E2E tests pass
- [ ] 14.6 Verify no remaining references to removed symbols: `OutputLive`, `OutputStructured`, `ActivityLive`, `ActivityStructured`, `InputLive`, `InputStructured`, `makeOutputTestLayer`, `makeActivityTestLayer`, `makeInputTestLayer`, `CliEnvironment`, `outputFormatFlag`, `makeUiLayer`
- [ ] 14.7 Kill any vitest worker processes
