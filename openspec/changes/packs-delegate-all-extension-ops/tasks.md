> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Lockfile Schema & Extension Ref Types

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add `CommandLockEntrySchema` and `CommandsLockMapSchema` to `packages/cli/src/lockfile/schema.ts` following the `SkillLockEntry` pattern but without the `agents` field. Add optional `commands` field to the `LockfileSchema`.
- [ ] 1.2 Add `McpServerLockEntrySchema` and `McpServersLockMapSchema` to `packages/cli/src/lockfile/schema.ts` following the same pattern. Add optional `mcpServers` field to the `LockfileSchema`.
- [ ] 1.3 Add `CommandExtensionRefBase`, `RegistryCommandRef`, and `CommandExtensionRef` union type to `packages/cli/src/sources/types.ts` following the `SkillExtensionRefBase` pattern. The command ref shape: `{ command: { name: string } }`.
- [ ] 1.4 Verify MCP server ref types already exist in `packages/cli/src/sources/types.ts`. If incomplete (missing `RegistryMcpServerRef` or union type), add them following the skill pattern. The server ref shape: `{ server: { name: string } }`.
- [ ] 1.5 Export new types from barrel files (`lockfile/index.ts`, `sources/index.ts`)
- [ ] 1.6 Run `pnpm typecheck` and fix any errors
- [ ] 1.7 Run `pnpm lint` and fix any errors
- [ ] 1.8 Run `pnpm test` and fix any failures
- [ ] 1.9 Kill any vitest worker processes

## 2. Workspace Service Methods

> **Subagent:** Run this entire phase in a single subagent.
>
> **Depends on:** Phase 1

- [ ] 2.1 Write tests for command workspace methods: `getLockedCommands()`, `getLockedCommand(name)`, `setCommand(args)`, `setCommandLock(args)`, `removeCommand(name)` — follow the existing skill method test patterns in the workspace service test file
- [ ] 2.2 Implement command workspace methods in `packages/cli/src/workspace/service.ts` following the skill/pack method patterns. All mutations go through the existing settings/lockfile semaphore.
- [ ] 2.3 Write tests for MCP server workspace methods: `getLockedMcpServers()`, `getLockedMcpServer(name)`, `setMcpServer(args)`, `setMcpServerLock(args)`, `removeMcpServer(name)`
- [ ] 2.4 Implement MCP server workspace methods in `packages/cli/src/workspace/service.ts` following the same patterns
- [ ] 2.5 Export new methods/types from `workspace/index.ts`
- [ ] 2.6 Run `pnpm typecheck` and fix any errors
- [ ] 2.7 Run `pnpm lint` and fix any errors
- [ ] 2.8 Run `pnpm test` and fix any failures
- [ ] 2.9 Kill any vitest worker processes

## 3. Command & MCP Server Operation Handlers

> **Subagent:** Run this entire phase in a single subagent.
>
> **Depends on:** Phase 2
> **Parallelization:** Tasks 3.1-3.4 (command install+uninstall) and 3.5-3.8 (MCP server install+uninstall) are independent — launch as parallel subagents.

- [ ] 3.1 Write tests for `installCommand` operation handler — cover: registry install, skipSettings, empty integrity with existing canonical (skip fetch), empty integrity without canonical (fetch without validation), non-empty integrity validation
- [ ] 3.2 Implement `installCommand` in `packages/cli/src/extensions/commands/operations/install.ts` following the `installSkill` registry path pattern but without agent symlinks. Create `InstallCommandOperation` type with args: `{ ref: CommandExtensionRef, force: boolean, versionConstraint: Option<string>, skipSettings: Option<boolean> }`
- [ ] 3.3 Write tests for `uninstallCommand` operation handler — cover: full uninstall (lockfile entry exists), command not installed (no-op), canonical directory already missing, settings removal failure (warning not error)
- [ ] 3.4 Implement `uninstallCommand` in `packages/cli/src/extensions/commands/operations/uninstall.ts` following the `uninstallSkill` pattern but without agent symlink removal. Create `UninstallCommandOperation` type with args: `{ commandName: string }`
- [ ] 3.5 Write tests for `installMcpServer` operation handler — same scenarios as command install
- [ ] 3.6 Implement `installMcpServer` in `packages/cli/src/extensions/mcp-servers/operations/install.ts` following the same pattern as `installCommand`. Create `InstallMcpServerOperation` type.
- [ ] 3.7 Write tests for `uninstallMcpServer` operation handler — same scenarios as command uninstall
- [ ] 3.8 Implement `uninstallMcpServer` in `packages/cli/src/extensions/mcp-servers/operations/uninstall.ts` following the same pattern as `uninstallCommand`. Create `UninstallMcpServerOperation` type.
- [ ] 3.9 Export operation types and handlers from barrel files (`extensions/commands/index.ts`, `extensions/mcp-servers/index.ts`)
- [ ] 3.10 Run `pnpm typecheck` and fix any errors
- [ ] 3.11 Run `pnpm lint` and fix any errors
- [ ] 3.12 Run `pnpm test` and fix any failures
- [ ] 3.13 Kill any vitest worker processes

## 4. Pack Install — Delegate Extension Operations

> **Subagent:** Run this entire phase in a single subagent.
>
> **Depends on:** Phase 3

- [ ] 4.1 Write/update tests for `buildInstallPlan` in `packages/cli/src/cli-commands/packs/install/plan.ts` — cover: plan includes skill/command/mcp-server install ops from pack ref, already-installed extensions marked no-op, plan ordering (pack first then extensions)
- [ ] 4.2 Update `PackInstallOp` union type to include `InstallCommandOperation | InstallMcpServerOperation`. Update `buildInstallPlan` to accept `commandOps` and `mcpServerOps` parameters and include them in the plan.
- [ ] 4.3 Write/update tests for the pack install handler — cover: handler builds extension refs from pack ref's resolved maps using `buildRegistrySkillRef`/`buildRegistryCommandRef`/`buildRegistryMcpServerRef` helpers, handler wires all operation handlers in `resolvePlan`
- [ ] 4.4 Update the pack install handler to: (a) build `RegistryCommandRef` and `RegistryMcpServerRef` from pack ref's `resolvedCommands` and `resolvedMcpServers` maps, (b) pass them as `InstallCommandOperation` and `InstallMcpServerOperation` to the plan builder, (c) register `installCommand` and `installMcpServer` handlers in `resolvePlan`
- [ ] 4.5 Create shared helper(s) for building registry refs from pack resolved maps (parse FQN, reuse pack's registry source, set empty integrity) — e.g. `buildRegistryCommandRef(fqn, version, source)`
- [ ] 4.6 Run `pnpm typecheck` and fix any errors
- [ ] 4.7 Run `pnpm lint` and fix any errors
- [ ] 4.8 Run `pnpm test` and fix any failures
- [ ] 4.9 Run `pnpm test:e2e` for packs install tests and fix any failures
- [ ] 4.10 Kill any vitest worker processes

## 5. Pack Uninstall — Extend Orphan Computation

> **Subagent:** Run this entire phase in a single subagent.
>
> **Depends on:** Phase 3

- [ ] 5.1 Write/update tests for `buildUninstallPlan` — cover: orphan detection for commands (collect from target packs, exclude remaining packs, exclude directly configured), orphan detection for MCP servers (same pattern), shared extension across packs not removed, directly installed extension not removed, glob pattern removing multiple packs that share extensions
- [ ] 5.2 Update `PackUninstallOp` union type to include `UninstallCommandOperation | UninstallMcpServerOperation`. Update `buildUninstallPlan` to accept `configuredCommands` and `configuredMcpServers` parameters and compute orphaned commands and MCP servers inline (same algorithm as skills).
- [ ] 5.3 Update the pack uninstall handler to: (a) read configured commands and MCP servers, (b) pass them to the plan builder, (c) register `uninstallCommand` and `uninstallMcpServer` handlers in `resolvePlan`
- [ ] 5.4 Remove `findOrphanedCommands` and `findOrphanedMcpServers` from `packages/cli/src/extensions/packs/operations/orphan-detection.ts` if they exist (orphan logic now lives in plan builder)
- [ ] 5.5 Run `pnpm typecheck` and fix any errors
- [ ] 5.6 Run `pnpm lint` and fix any errors
- [ ] 5.7 Run `pnpm test` and fix any failures
- [ ] 5.8 Run `pnpm test:e2e` for packs uninstall tests and fix any failures
- [ ] 5.9 Kill any vitest worker processes

## 6. Pack Unpack — Plan-Based Install Operations

> **Subagent:** Run this entire phase in a single subagent.
>
> **Depends on:** Phases 4 and 5

- [ ] 6.1 Write/update tests for the unpack plan builder — cover: plan emits install-skill/install-command/install-mcp-server steps for each resolved extension, already directly installed extensions marked no-op, plan ordering (install ops first, uninstall-pack last)
- [ ] 6.2 Create a plan builder for unpack (or refactor the existing inline logic into a plan) that emits: `InstallSkillOperation` (with `skipSettings: false`) for each resolved skill, `InstallCommandOperation` for each resolved command, `InstallMcpServerOperation` for each resolved MCP server, and `UninstallPackOperation` to remove the pack
- [ ] 6.3 Write/update tests for the unpack handler — cover: handler builds plan from pack lock entry, handler wires all operation handlers, extensions remain on disk after unpack, settings entries created for promoted extensions
- [ ] 6.4 Refactor the unpack handler to use the plan-based approach instead of inline `ws.setSkill()` calls. Wire `installSkill`, `installCommand`, `installMcpServer`, and `uninstallPack` handlers in `resolvePlan`.
- [ ] 6.5 Define `PackUnpackOp` union type: `InstallSkillOperation | InstallCommandOperation | InstallMcpServerOperation | UninstallPackOperation`
- [ ] 6.6 Run `pnpm typecheck` and fix any errors
- [ ] 6.7 Run `pnpm lint` and fix any errors
- [ ] 6.8 Run `pnpm test` and fix any failures
- [ ] 6.9 Run `pnpm test:e2e` for packs unpack tests and fix any failures
- [ ] 6.10 Kill any vitest worker processes

## 7. Final Verification

> **Subagent:** Run this entire phase in a single subagent.
>
> **Depends on:** Phase 6

- [ ] 7.1 Run `pnpm typecheck` across all packages
- [ ] 7.2 Run `pnpm lint` across all packages
- [ ] 7.3 Run `pnpm test` across all packages
- [ ] 7.4 Run `pnpm test:e2e` across all packages
- [ ] 7.5 Kill any vitest worker processes
