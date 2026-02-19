> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Generic Publish Extension Operation

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Write tests for a generic `publishExtension` operation handler that publishes any extension type (skill, command, mcp-server) given a type and FQN — test manifest reading, archive building, integrity computation, and registry publish call
- [x] 1.2 Implement `PublishExtensionOperation` type in `packs/operations.ts` (name: `"publish-extension"`, args: `{ name: string; type: "skill" | "command" | "mcp-server"; registryName: string }`)
- [x] 1.3 Implement `publishExtension` operation handler that reads the type-specific manifest, builds a zip archive, computes SRI integrity, and publishes to the registry — reuse patterns from `publishSkill` and `publishPack`
- [x] 1.4 Run `pnpm typecheck` and fix any errors
- [x] 1.5 Run `pnpm lint` and fix any errors
- [x] 1.6 Run `pnpm test` and fix any failures
- [x] 1.7 Kill any vitest worker processes

## 2. Command Flag and Handler Args

> **Subagent:** Run this entire phase in a single subagent.

- [x] 2.1 Write command parsing tests for `--include-dependencies` / `-d` flag (default `false`)
- [x] 2.2 Add `--include-dependencies` (`-d`, boolean, default `false`) to `PublishPackCommandArgs` and the yargs builder in `packs/publish/command.ts`
- [x] 2.3 Add `includeDepdendencies: boolean` to `PublishPackHandlerArgs` in `packs/publish/handler.ts`
- [x] 2.4 Wire the flag from command args to handler args in the command module
- [x] 2.5 Run `pnpm typecheck` and fix any errors
- [x] 2.6 Run `pnpm lint` and fix any errors
- [x] 2.7 Run `pnpm test` and fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Handler Dependency Discovery and Plan Construction

> **Subagent:** Run this entire phase in a single subagent.

- [x] 3.1 Write handler tests: when `--include-dependencies` is `false`, plan contains only the pack publish step (existing behavior unchanged)
- [x] 3.2 Write handler tests: when `--include-dependencies` is `true`, handler reads manifest, discovers locally managed dependencies, and builds a two-job plan (dependencies first, pack second)
- [x] 3.3 Write handler tests: non-local dependencies (missing from `.axm/extensions/`) are skipped with a warning
- [x] 3.4 Write handler tests: pack with no dependencies and `--include-dependencies` produces a single-step plan
- [x] 3.5 Implement dependency discovery in handler — read pack manifest, collect all FQNs from `skills`, `commands`, `mcp-servers`, check which exist locally in `.axm/extensions/`
- [x] 3.6 Implement plan construction — build `PublishExtensionOperation` steps for local dependencies (Job 1, concurrent) and `PublishPackOperation` step for the pack (Job 2)
- [x] 3.7 Define the union operation type (`PackPublishOp = PublishPackOperation | PublishExtensionOperation`) and wire both handlers into `ws.resolvePlan`
- [x] 3.8 Run `pnpm typecheck` and fix any errors
- [x] 3.9 Run `pnpm lint` and fix any errors
- [x] 3.10 Run `pnpm test` and fix any failures
- [x] 3.11 Kill any vitest worker processes

## 4. E2E Tests

> **Subagent:** Run this entire phase in a single subagent.

- [x] 4.1 Write E2E test: `axm packs publish my-pack --include-dependencies --yes` publishes dependencies and pack
- [x] 4.2 Write E2E test: `axm packs publish my-pack --include-dependencies --preview` shows dependency steps in plan without applying
- [x] 4.3 Write E2E test: `axm packs publish my-pack --yes` (without flag) publishes only the pack
- [x] 4.4 Run `pnpm test:e2e` and fix any failures
- [x] 4.5 Run `pnpm typecheck` and fix any errors
- [x] 4.6 Run `pnpm lint` and fix any errors
- [x] 4.7 Kill any vitest worker processes
