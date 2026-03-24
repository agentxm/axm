> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Create CliFlags Service

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Write tests for `CliFlags` service in `packages/cli/src/cli-flags/service.test.ts`: resolution chain (explicit flag overrides CI overrides TTY), `Option.none()` triggers auto-detection, `Option.some(false)` bypasses auto-detection, `yes` stores only explicit value
- [x] 1.2 Create `CliFlagsService` interface and `CliFlags` Context.Tag in `packages/cli/src/cli-flags/service.ts`
- [x] 1.3 Create `CliFlagsInput` interface and `layer()` constructor with `nonInteractive` resolution chain (explicit → CI → TTY) in `packages/cli/src/cli-flags/service.ts`
- [x] 1.4 Create `CliFlagsTest` helper function (defaults: `nonInteractive: true`, `yes: false`, `force: false`, `preview: false`) in `packages/cli/src/cli-flags/service.ts`
- [x] 1.5 Create barrel `packages/cli/src/cli-flags/index.ts` exporting `CliFlags`, `CliFlagsService`, `CliFlagsInput`, `CliFlagsTest`, and `layer`
- [x] 1.6 Run `pnpm typecheck` and fix any errors
- [x] 1.7 Run `pnpm lint` and fix any errors
- [x] 1.8 Run `pnpm test` and fix any failures
- [x] 1.9 Kill any vitest worker processes

## 2. Global Flags and Runtime Wiring

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [x] 2.1 Write tests for `run()` accepting `CliFlagsInput` and providing `CliFlags` layer (if runtime tests exist; otherwise skip)
- [x] 2.2 Add `--yes` (`-y`), `--force` (`-f`), and `--preview` as global options in `packages/cli/src/main.ts` (keep `--non-interactive` with no default)
- [x] 2.3 Add `CliFlags` to the `AppLayer` type union in `packages/cli/src/runtime/index.ts`
- [x] 2.4 Update `run()` signature to accept `{ flags: CliFlagsInput; workspace?: WorkspaceContextOptions }` and construct+provide the `CliFlags` layer
- [x] 2.5 Run `pnpm typecheck` and fix any errors
- [x] 2.6 Run `pnpm lint` and fix any errors
- [x] 2.7 Run `pnpm test` and fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Prompt Service Non-Interactive Guard

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [x] 3.1 Write tests for prompt guard in `packages/cli/src/clack-effect/prompt/service.test.ts`: calling any prompt method when `nonInteractive: true` fails with `PROMPT_IN_NON_INTERACTIVE` AppError; calling when `nonInteractive: false` proceeds normally
- [x] 3.2 Update `wrapPrompt` (or introduce `guardedPrompt`) in `packages/cli/src/clack-effect/prompt/service.ts` to yield `CliFlags` and fail fast when `nonInteractive` is true
- [x] 3.3 Update `ClackPromptLive` from `Layer.succeed` to `Layer.effect` since it now needs to yield `CliFlags`
- [x] 3.4 Run `pnpm typecheck` and fix any errors
- [x] 3.5 Run `pnpm lint` and fix any errors
- [x] 3.6 Run `pnpm test` and fix any failures
- [x] 3.7 Kill any vitest worker processes

## 4. Workspace Service Migration

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2

- [x] 4.1 Update workspace service tests in `packages/cli/src/workspace/service.test.ts`: replace `WorkspaceContextOptions` flag fields with `CliFlagsTest` layer, update `nonInteractive` resolution tests to verify they delegate to `CliFlags`
- [x] 4.2 Remove `yes`, `nonInteractive`, `preview`, `force` from `WorkspaceContextOptions` interface in `packages/cli/src/workspace/service.ts` (keep `scope` and `agents`)
- [x] 4.3 Update `make()` to yield `CliFlags` instead of resolving `nonInteractive` locally; remove `resolvedNonInteractive` and `resolvedYes` variables
- [x] 4.4 Update `resolvePlan` closure to yield `CliFlags` for `preview`, `yes`, `nonInteractive`, `force` instead of reading from `options` closure
- [x] 4.5 Remove `nonInteractive` and `preview` fields from `WorkspaceContextService` interface
- [x] 4.6 Update `initializeProjectWorkspace` in `packages/cli/src/workspace/initialization.ts` to yield `CliFlags` instead of receiving `resolvedNonInteractive` parameter
- [x] 4.7 Update initialization tests in `packages/cli/src/cli-commands/init/handler.test.ts` to provide `CliFlagsTest` layer
- [x] 4.8 Remove `isInteractive` import from `packages/cli/src/workspace/service.ts` (now only used by CliFlags layer)
- [x] 4.9 Run `pnpm typecheck` and fix any errors
- [x] 4.10 Run `pnpm lint` and fix any errors
- [x] 4.11 Run `pnpm test` and fix any failures
- [x] 4.12 Kill any vitest worker processes

## 5. Migrate Command Files — Skills Family

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2, Phase 4

> **Parallelization:** Tasks 5.1–5.8 are independent — launch as parallel subagents if desired.

For each command: remove per-command `.option()` calls for `yes`, `non-interactive`, `force`, `preview`; remove those fields from the command args interface; update the handler call to pass `flags: { yes: argv.yes, nonInteractive: Option.fromNullable(argv["non-interactive"]), force: argv.force, preview: argv.preview }` to `run()` instead of duplicating into both handler args and workspace options.

- [x] 5.1 Migrate `packages/cli/src/cli-commands/skills/install/command.ts` — remove per-command flag defs, update handler call, update `command-actions.ts` to yield `CliFlags` instead of resolving `nonInteractive` locally, update `select-skills.ts` to yield `CliFlags` instead of receiving `nonInteractive` in args
- [x] 5.2 Migrate `packages/cli/src/cli-commands/skills/update/command.ts` and `handler.ts` — remove `nonInteractive` from handler args
- [x] 5.3 Migrate `packages/cli/src/cli-commands/skills/uninstall/command.ts`
- [x] 5.4 Migrate `packages/cli/src/cli-commands/skills/enable/command.ts` and `packages/cli/src/cli-commands/skills/disable/command.ts`
- [x] 5.5 Migrate `packages/cli/src/cli-commands/skills/new/command.ts`, `packages/cli/src/cli-commands/skills/fork/command.ts`, `packages/cli/src/cli-commands/skills/publish/command.ts`
- [x] 5.6 Migrate `packages/cli/src/cli-commands/skills/rename/command.ts`
- [x] 5.7 Migrate `packages/cli/src/cli-commands/skills/list/command.ts` (currently hardcodes `nonInteractive: Option.some(true)` — switch to `CliFlagsTest` or rely on global flag)
- [x] 5.8 Update all skills command tests (`command.test.ts`) — remove assertions about per-command flag definitions for `yes`, `non-interactive`, `force`, `preview`; update handler test stubs to provide `CliFlagsTest` layer instead of `nonInteractive: Option.some(true)` in args
- [x] 5.9 Run `pnpm typecheck` and fix any errors
- [x] 5.10 Run `pnpm lint` and fix any errors
- [x] 5.11 Run `pnpm test` and fix any failures
- [x] 5.12 Run `pnpm test:e2e` for skills tests and fix any failures
- [x] 5.13 Kill any vitest worker processes

## 6. Migrate Command Files — Packs, Commands, MCP-Servers, Init

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2, Phase 4

> **Parallelization:** Tasks 6.1–6.5 are independent — launch as parallel subagents if desired.

Same pattern as Phase 5: remove per-command flag defs, update handler calls, update command-actions to yield `CliFlags`.

- [x] 6.1 Migrate `packages/cli/src/cli-commands/init/command.ts` — fix the `default: false` bug on `--non-interactive`; remove per-command flags; update handler call
- [x] 6.2 Migrate packs commands: `install`, `uninstall`, `new`, `add`, `remove`, `publish`, `unpack` — remove per-command flag defs; update `packs/install/command-actions.ts` to yield `CliFlags`
- [x] 6.3 Migrate commands commands: `install`, `uninstall` — remove per-command flag defs; update `commands/install/command-actions.ts` to yield `CliFlags`
- [x] 6.4 Migrate mcp-servers commands: `install`, `uninstall` — remove per-command flag defs; update `mcp-servers/install/command-actions.ts` to yield `CliFlags`
- [x] 6.5 Update all command tests for init, packs, commands, mcp-servers — remove per-command flag definition assertions; update handler test stubs to provide `CliFlagsTest` layer
- [x] 6.6 Run `pnpm typecheck` and fix any errors
- [x] 6.7 Run `pnpm lint` and fix any errors
- [x] 6.8 Run `pnpm test` and fix any failures
- [x] 6.9 Run `pnpm test:e2e` for init, packs, commands, mcp-servers tests and fix any failures
- [x] 6.10 Kill any vitest worker processes

## 7. Migrate Remaining Consumers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4

- [x] 7.1 Update `packages/cli/src/sources/registry-guard.ts` to yield `CliFlags` for `nonInteractive` instead of reading from workspace service
- [x] 7.2 Update `packages/cli/src/sources/registry-guard.test.ts` to provide `CliFlagsTest` layer
- [x] 7.3 Update any remaining files that read `workspace.nonInteractive` or `workspace.preview` — switch to `yield* CliFlags`
- [x] 7.4 Update `packages/cli/src/workspace/test-stubs.ts` — remove `nonInteractive` field from workspace test stubs
- [x] 7.5 Run `pnpm typecheck` and fix any errors
- [x] 7.6 Run `pnpm lint` and fix any errors
- [x] 7.7 Run `pnpm test` and fix any failures
- [x] 7.8 Kill any vitest worker processes

## 8. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: All previous phases

- [x] 8.1 Run `pnpm typecheck` across all packages — confirm zero errors
- [x] 8.2 Run `pnpm lint` across all packages — confirm zero errors
- [x] 8.3 Run `pnpm test` across all packages — confirm all pass
- [x] 8.4 Run `pnpm test:e2e` — confirm all E2E tests pass
- [x] 8.5 Grep for any remaining `Option.fromNullable(argv["non-interactive"])` in handler calls outside of `run()` — should be zero (all resolution happens in `run()`)
- [x] 8.6 Grep for any remaining `.option("yes"` or `.option("non-interactive"` in command builders — should be zero (all global now)
- [x] 8.7 Grep for any remaining `nonInteractive: Option.Option<boolean>` in handler arg types — should be zero (handlers yield `CliFlags`)
- [x] 8.8 Kill any vitest worker processes
