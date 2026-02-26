> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Plan Type Evolution + Handler Adaptation

> **Subagent:** Run this entire phase in a single subagent.

Foundational breaking change: evolve `PlannedJobStep`, `Plan`, `resolvePlan`, and `applyPlan` to the new readiness-aware model with `run` closures. Adapt all existing handlers to compile with new types. **No dependencies — start here.**

- [ ] 1.1 Write tests for new plan type readiness model: ready steps execute, warn steps prompt (and respect `--force`), error steps block entire plan with `CliError` (code: `PLAN_BLOCKED_BY_ERRORS`), warn decline returns `PromptCancelled`
- [ ] 1.2 Write tests for inter-job blocking (step error in job N blocks job N+1) and intra-job continuation (sibling steps in same job continue)
- [ ] 1.3 Evolve `PlannedJobStep` from generic `PlannedJobStep<TOperation>` to discriminated union `ReadyJobStep | WarnJobStep | ErrorJobStep` with `run` closures (`Effect<JobStepResult, CliError, never>`). Remove `operation` payload and `_tag`. Add `CompletedJobStep`, `ExecutedPlan`, and update `JobStepResult` (remove `no-op`, keep `success`/`error`). Update `Plan` and `Job` to non-generic. All in `workspace/plan.ts`.
- [ ] 1.4 Typecheck `packages/cli` — identify and list all compilation errors from type changes
- [ ] 1.5 Evolve `applyPlan` in `workspace/apply-plan.ts`: remove handler-map dispatch; iterate steps and execute `step.run()` directly for `ready`/`warn` steps; promote `error` steps to error results without execution. Preserve inter-job blocking and intra-job continuation. Return `ExecutedPlan`.
- [ ] 1.6 Evolve `resolvePlan` in `workspace/service.ts`: remove handler-map parameter; remove `augmentPlan` call; add readiness gating (fail with `CliError` code `PLAN_BLOCKED_BY_ERRORS` when any step has `readiness === "error"`); add warn prompting (prompt user unless `--force`; fail with `PromptCancelled` on decline); execute via new `applyPlan`. Signature: `resolvePlan(plan: Plan) => Effect<ExecutedPlan, PromptCancelled | CliError>`.
- [ ] 1.7 Typecheck `packages/cli`
- [ ] 1.8 Adapt skills install plan builder (`cli-commands/skills/install/`) to use new `PlannedJobStep` with inline `run` closures that capture workspace service + materialization dependencies. Remove operation-based step construction. Update handler to call `ws.resolvePlan(plan)` without handler map.
- [ ] 1.9 Adapt skills uninstall plan builder and handler similarly — inline `run` closures capture workspace service for removal + pack-ownership checks.
- [ ] 1.10 Adapt packs install plan builder and handler — inline `run` closures for pack + dependency install operations. Capture workspace service and materialization functions.
- [ ] 1.11 Adapt packs uninstall plan builder and handler — inline `run` closures for pack + dependency uninstall operations.
- [ ] 1.12 Typecheck `packages/cli`
- [ ] 1.13 Remove `augmentPlan` module (`workspace/augment-plan.ts`) and all imports
- [ ] 1.14 Remove `Operation`, `OperationMap`, `OperationMapFromUnion`, `OperationUnion`, `defineOperationMetadata`, and `operation-metadata.ts` files from `extensions/*/operations/metadata.ts`
- [ ] 1.15 Remove `operation-registry.ts` and `operationMetadataRegistry`
- [ ] 1.16 Remove `makeStep` helper (replaced by direct step construction)
- [ ] 1.17 Typecheck `packages/cli`
- [ ] 1.18 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 1.19 Run `pnpm lint` for all packages, fix any errors
- [ ] 1.20 Run `pnpm test` for all packages, fix any failures
- [ ] 1.21 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 1.22 Kill any remaining vitest worker processes

## 2. Shared Operation Workflows + Target Types

> **Subagent:** Run this entire phase in a single subagent.

Create the shared operation workflow layer: `ExtensionTarget` types, `ExtensionManager<TRef>` interface, `buildInstallOperation`/`buildUninstallOperation`, `runInstallOperation`/`runUninstallOperation`, and `UninstallRetentionPolicy`. New files in `packages/cli/src/workflows/install-operation/` and `uninstall-operation/`. **Depends on: Phase 1** (uses evolved plan types).

- [ ] 2.1 Write tests for `ExtensionTarget` type construction and `targetFromRef`/`toLabel` helpers — verify pack targets include namespace, skill/command/mcp-server targets are name-only
- [ ] 2.2 Implement `ExtensionTarget` discriminated union (`SkillExtensionTarget`, `PackExtensionTarget`, `CommandExtensionTarget`, `McpServerExtensionTarget`), `targetFromRef`, `toLabel`, and `ExtensionTargetFor<TRef>` in `workflows/install-operation/workflow.ts`
- [ ] 2.3 Define `ExtensionManager<TRef>` interface with all 6 methods (`materializeInstall`, `materializeUninstall`, `upsertSettingsEntry`, `removeSettingsEntry`, `upsertLockfileEntry`, `removeLockfileEntry`) — all `R = never`
- [ ] 2.4 Define `UninstallRetentionPolicy` interface (`isRequiredByInstalledPack`, `markDependencyRetainedInLockfile`)
- [ ] 2.5 Typecheck
- [ ] 2.6 Write tests for `runInstallOperation` canonical sequence: materialize → lockfile → settings (verify ordering via mock manager)
- [ ] 2.7 Implement `buildInstallOperation` and `runInstallOperation` in `workflows/install-operation/workflow.ts`
- [ ] 2.8 Write tests for `runUninstallOperation`: retention path (settings removal + lockfile retention) vs full removal path (disk + lockfile + settings)
- [ ] 2.9 Implement `buildUninstallOperation` and `runUninstallOperation` in `workflows/uninstall-operation/workflow.ts`
- [ ] 2.10 Typecheck
- [ ] 2.11 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 2.12 Run `pnpm lint` for all packages, fix any errors
- [ ] 2.13 Run `pnpm test` for all packages, fix any failures
- [ ] 2.14 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 2.15 Kill any remaining vitest worker processes

## 3. Workspace Service Evolution

> **Subagent:** Run this entire phase in a single subagent.

Add granular settings/lockfile mutation methods needed by extension managers, plus cross-cutting pack-dependency queries. **Depends on: Phase 1** (no strict dependency, but Phase 1 should complete first for stable workspace service baseline). **Can run in parallel with Phase 2.**

- [ ] 3.1 Write tests for new granular removal methods: `removeSkillLock` (lockfile-only), `removeCommandSettings` (settings-only), `removeCommandLock` (lockfile-only), `removeMcpServerSettings` (settings-only), `removeMcpServerLock` (lockfile-only), `removePackSettings` (settings-only), `removePackLock` (lockfile-only)
- [ ] 3.2 Implement granular removal methods in `workspace/service.ts` — each follows the existing mutex-serialized pattern. Note: `removeSkillFromSettings` already exists (reuse or alias as `removeSkillSettings`).
- [ ] 3.3 Typecheck
- [ ] 3.4 Write tests for `isExtensionRequiredByInstalledPack(target: ExtensionTarget)` — checks all installed packs' resolved dependency maps (`resolvedSkills`, `resolvedCommands`, `resolvedMcpServers`) for the target
- [ ] 3.5 Implement `isExtensionRequiredByInstalledPack` in `workspace/service.ts`
- [ ] 3.6 Write tests for `markDependencyRetainedInLockfile(target: ExtensionTarget)` — updates lockfile entry to indicate retention without removing it
- [ ] 3.7 Implement `markDependencyRetainedInLockfile` in `workspace/service.ts`
- [ ] 3.8 Typecheck
- [ ] 3.9 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 3.10 Run `pnpm lint` for all packages, fix any errors
- [ ] 3.11 Run `pnpm test` for all packages, fix any failures
- [ ] 3.12 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 3.13 Kill any remaining vitest worker processes

## 4. Extension Manager Services

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1-4.2, 4.3-4.4, 4.5-4.6, 4.7-4.8 are independent — launch as parallel subagents if desired.

Implement per-`ExtensionType` manager services that satisfy the `ExtensionManager<TRef>` contract. Each manager encapsulates type-specific materialization + workspace state mutations with `R = never`. **Depends on: Phase 2** (ExtensionManager interface) **and Phase 3** (granular workspace methods).

- [ ] 4.1 Write tests for `SkillManager` contract compliance: all 6 methods, native vs non-native branching in `materializeInstall`, agent symlink creation for all configured agents, lock entry includes `agents` field
- [ ] 4.2 Implement `SkillManager` service tag + `SkillManagerLive` layer in `extensions/skills/manager.ts` — captures `Workspace` and configured agents during construction; delegates to existing skill materialization functions
- [ ] 4.3 Write tests for `PackManager` contract compliance: all 6 methods, pack materialization delegates to existing pack install/uninstall functions
- [ ] 4.4 Implement `PackManager` service tag + `PackManagerLive` layer in `extensions/packs/manager.ts`
- [ ] 4.5 Write tests for `CommandManager` contract compliance: all 6 methods
- [ ] 4.6 Implement `CommandManager` service tag + `CommandManagerLive` layer in `extensions/commands/manager.ts`
- [ ] 4.7 Write tests for `McpServerManager` contract compliance: all 6 methods
- [ ] 4.8 Implement `McpServerManager` service tag + `McpServerManagerLive` layer in `extensions/mcp-servers/manager.ts`
- [ ] 4.9 Typecheck
- [ ] 4.10 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 4.11 Run `pnpm lint` for all packages, fix any errors
- [ ] 4.12 Run `pnpm test` for all packages, fix any failures
- [ ] 4.13 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 4.14 Kill any remaining vitest worker processes

## 5. Command-Family Workflow Infrastructure

> **Subagent:** Run this entire phase in a single subagent.

Create the command-family workflow contracts and orchestration functions. New files in `packages/cli/src/workflows/install-command/` and `uninstall-command/`. **Depends on: Phase 1** (uses `resolvePlan`). **Can run in parallel with Phases 2, 3, 4.**

- [ ] 5.1 Write tests for `runInstallCommandWorkflow` phase ordering: parse → resolveSource → discover → finalizeIntent → buildPlan → resolvePlan (verify via mock actions that record call order)
- [ ] 5.2 Define `InstallExtensionCommandWorkflowActions<Args, Parsed, Req, Ref, Intent>` interface in `workflows/install-command/workflow.ts`
- [ ] 5.3 Implement `runInstallCommandWorkflow` — generic orchestration that calls action methods in canonical order then `ws.resolvePlan(plan)`
- [ ] 5.4 Write tests for `runUninstallCommandWorkflow` phase ordering: parse → finalizeIntent → buildUninstallPlan → resolvePlan
- [ ] 5.5 Define `UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent>` interface in `workflows/uninstall-command/workflow.ts`
- [ ] 5.6 Implement `runUninstallCommandWorkflow`
- [ ] 5.7 Typecheck
- [ ] 5.8 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 5.9 Run `pnpm lint` for all packages, fix any errors
- [ ] 5.10 Run `pnpm test` for all packages, fix any failures
- [ ] 5.11 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 5.12 Kill any remaining vitest worker processes

## 6. Pack Ref Namespace + Expansion Helpers

> **Subagent:** Run this entire phase in a single subagent.

Add `namespace` field to `PackExtensionRefBase` and implement pack install/uninstall expansion helpers. **Depends on: Phase 2** (ExtensionTarget types). **Can run in parallel with Phases 3, 4, 5.**

- [ ] 6.1 Add `readonly namespace: string` to `PackExtensionRefBase` in `sources/types.ts`
- [ ] 6.2 Populate `namespace` in `RegistryPackRef` construction (from `RegistryRefDetails.namespace`) and `BuiltinPackRef` construction (from builtin manifest)
- [ ] 6.3 Fix all compilation errors from the new required field — update pack ref construction sites, tests, and fixtures
- [ ] 6.4 Typecheck
- [ ] 6.5 Write tests for `expandPackInstallRefs` — pack ref first, then dependency refs (skill, command, mcp-server) in declaration order, using pack's registry source and empty integrity
- [ ] 6.6 Implement `expandPackInstallRefs` helper
- [ ] 6.7 Write tests for `expandPackUninstallTargets` — computes removable targets: pack deps minus remaining-pack-refs minus directly-configured extensions; pack target first then orphaned deps
- [ ] 6.8 Implement `expandPackUninstallTargets` helper
- [ ] 6.9 Write tests for `resolveSkillUninstallTargetsFromLockfile` — resolves skill names to `SkillExtensionTarget` via lockfile; fails with `CliError` if name not found
- [ ] 6.10 Implement `resolveSkillUninstallTargetsFromLockfile` helper
- [ ] 6.11 Typecheck
- [ ] 6.12 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 6.13 Run `pnpm lint` for all packages, fix any errors
- [ ] 6.14 Run `pnpm test` for all packages, fix any failures
- [ ] 6.15 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 6.16 Kill any remaining vitest worker processes

## 7. Skill Install/Uninstall Workflow Migration

> **Subagent:** Run this entire phase in a single subagent.

Migrate skill install and uninstall handlers from inline run closures (Phase 1 adaptation) to command-family workflows with dedicated command actions services. **Depends on: Phases 4, 5, 6.**

- [ ] 7.1 Create `InstallSkillCommandIntent` type in `cli-commands/skills/install/intent.ts`
- [ ] 7.2 Implement skill install command action functions: `parseSkillInstallArgs`, `resolveSkillInstallSources`, `discoverSkillRefs`, `finalizeSkillInstallIntent` — extract from existing handler logic
- [ ] 7.3 Implement `buildSkillInstallPlan` using `buildInstallOperation(skillManager, ...)` from Phase 2
- [ ] 7.4 Create `InstallSkillCommandWorkflowActions` service tag + `InstallSkillCommandWorkflowActionsLive` layer in `cli-commands/skills/install/command-actions.ts`
- [ ] 7.5 Migrate skills install handler to resolve `InstallSkillCommandWorkflowActions` and invoke `runInstallCommandWorkflow`
- [ ] 7.6 Write/update tests for migrated skills install flow — verify workflow phase ordering and plan correctness
- [ ] 7.7 Typecheck
- [ ] 7.8 Create `UninstallSkillCommandIntent` type in `cli-commands/skills/uninstall/intent.ts`
- [ ] 7.9 Implement skill uninstall command action functions: `parseSkillUninstallArgs`, `finalizeSkillUninstallIntent` — extract from existing handler logic
- [ ] 7.10 Implement `buildSkillUninstallPlan` using `buildUninstallOperation(skillManager, retentionPolicy, ...)` with `resolveSkillUninstallTargetsFromLockfile` from Phase 6
- [ ] 7.11 Create `UninstallSkillCommandWorkflowActions` service tag + `UninstallSkillCommandWorkflowActionsLive` layer
- [ ] 7.12 Migrate skills uninstall handler to resolve `UninstallSkillCommandWorkflowActions` and invoke `runUninstallCommandWorkflow`
- [ ] 7.13 Write/update tests for migrated skills uninstall flow — verify retention policy, lockfile target resolution
- [ ] 7.14 Typecheck
- [ ] 7.15 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 7.16 Run `pnpm lint` for all packages, fix any errors
- [ ] 7.17 Run `pnpm test` for all packages, fix any failures
- [ ] 7.18 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 7.19 Kill any remaining vitest worker processes

## 8. Pack Install/Uninstall Workflow Migration

> **Subagent:** Run this entire phase in a single subagent.

Migrate pack install and uninstall handlers to command-family workflows. Pack install uses `expandPackInstallRefs` for cross-type dependency expansion. Pack uninstall uses `expandPackUninstallTargets` for orphan computation. **Depends on: Phases 4, 5, 6. Can run in parallel with Phase 7.**

- [ ] 8.1 Create `InstallPackCommandIntent` type in `cli-commands/packs/install/intent.ts`
- [ ] 8.2 Implement pack install command action functions: `parsePackInstallArgs`, `resolvePackInstallSources`, `discoverPackRefs`, `buildPackInstallIntent` — extract from existing handler logic
- [ ] 8.3 Implement `buildPackInstallPlan` using `expandPackInstallRefs` + `buildInstallOperation` for pack, skill, command, and mcp-server refs (dispatching to respective managers)
- [ ] 8.4 Create `InstallPackCommandWorkflowActions` service tag + `InstallPackCommandWorkflowActionsLive` layer
- [ ] 8.5 Migrate packs install handler to resolve `InstallPackCommandWorkflowActions` and invoke `runInstallCommandWorkflow`
- [ ] 8.6 Write/update tests for migrated packs install flow — verify cross-type expansion, dependency install without user version constraint, plan ordering (pack first)
- [ ] 8.7 Typecheck
- [ ] 8.8 Create `UninstallPackCommandIntent` type in `cli-commands/packs/uninstall/intent.ts`
- [ ] 8.9 Implement pack uninstall command action functions: `parsePackUninstallArgs`, `finalizePackUninstallIntent` — extract from existing handler logic
- [ ] 8.10 Implement `buildPackUninstallPlan` using `expandPackUninstallTargets` + `buildUninstallOperation` for pack and orphaned dependency targets (dispatching to respective managers)
- [ ] 8.11 Create `UninstallPackCommandWorkflowActions` service tag + `UninstallPackCommandWorkflowActionsLive` layer
- [ ] 8.12 Migrate packs uninstall handler to resolve `UninstallPackCommandWorkflowActions` and invoke `runUninstallCommandWorkflow`
- [ ] 8.13 Write/update tests for migrated packs uninstall flow — verify orphan computation, dependency retention, plan ordering (pack first then deps)
- [ ] 8.14 Typecheck
- [ ] 8.15 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 8.16 Run `pnpm lint` for all packages, fix any errors
- [ ] 8.17 Run `pnpm test` for all packages, fix any failures
- [ ] 8.18 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 8.19 Kill any remaining vitest worker processes

## 9. Command + MCP Server Workflow Migration

> **Subagent:** Run this entire phase in a single subagent.

Migrate command and mcp-server install/uninstall flows to command-family workflows. These currently exist only as operation handlers within the pack flow — this phase creates standalone command actions services and handlers (or adapts existing ones). **Depends on: Phases 4, 5. Can run in parallel with Phases 7 and 8.**

- [ ] 9.1 Assess current command install/uninstall handler state — determine if standalone `axm commands install/uninstall` CLI commands exist or if commands are pack-dependency-only. Document findings.
- [ ] 9.2 If standalone command install/uninstall handlers exist: create `InstallCommandCommandIntent`, implement command install command actions, create `InstallCommandCommandWorkflowActions` service + layer, migrate handler. If pack-dependency-only: create the handler + command definition + actions service.
- [ ] 9.3 If standalone command uninstall handler exists: create `UninstallCommandCommandIntent`, implement command uninstall command actions, create `UninstallCommandCommandWorkflowActions` service + layer, migrate handler. If pack-dependency-only: create the handler + command definition + actions service.
- [ ] 9.4 Typecheck
- [ ] 9.5 Assess current mcp-server install/uninstall handler state — same as 9.1 but for mcp-servers.
- [ ] 9.6 If standalone mcp-server install handler exists: create `InstallMcpServerCommandIntent`, implement mcp-server install command actions, create `InstallMcpServerCommandWorkflowActions` service + layer, migrate handler. If pack-dependency-only: create the handler + command definition + actions service.
- [ ] 9.7 If standalone mcp-server uninstall handler exists: create `UninstallMcpServerCommandIntent`, implement mcp-server uninstall command actions, create `UninstallMcpServerCommandWorkflowActions` service + layer, migrate handler. If pack-dependency-only: create the handler + command definition + actions service.
- [ ] 9.8 Write tests for command manager + mcp-server manager integration through workflow actions (verify they satisfy install/uninstall workflow contracts)
- [ ] 9.9 Typecheck
- [ ] 9.10 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 9.11 Run `pnpm lint` for all packages, fix any errors
- [ ] 9.12 Run `pnpm test` for all packages, fix any failures
- [ ] 9.13 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 9.14 Kill any remaining vitest worker processes

## 10. CLI Flag Changes

> **Subagent:** Run this entire phase in a single subagent.

Remove deprecated CLI flags and update `--force` semantics. **Depends on: Phases 7, 8** (handlers migrated so flag wiring can be updated).

- [ ] 10.1 Remove `--list` flag from skills install command definition (`cli-commands/skills/install/command.ts`) and any handler references
- [ ] 10.2 Remove `--agent` flag from skills install command definition and handler — skill install is now workspace-scoped (installs to all configured agents via `SkillManager`)
- [ ] 10.3 Remove `--agent` flag from skills uninstall command definition and handler
- [ ] 10.4 Update `--force` flag semantics: ensure `resolvePlan` uses `--force` to auto-accept warn-readiness steps (implemented in Phase 1) and remove any legacy `--force` skip-if-installed behavior from handlers
- [ ] 10.5 Write/update tests for removed flags: verify `--list` and `--agent` are rejected, verify `--force` bypasses warn prompts
- [ ] 10.6 Typecheck
- [ ] 10.7 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 10.8 Run `pnpm lint` for all packages, fix any errors
- [ ] 10.9 Run `pnpm test` for all packages, fix any failures
- [ ] 10.10 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 10.11 Kill any remaining vitest worker processes

## 11. Legacy Code Removal

> **Subagent:** Run this entire phase in a single subagent.

Remove all legacy operation handler paths and duplicated orchestration code now that all handlers use shared workflows. **Depends on: Phases 7, 8, 9, 10.**

- [ ] 11.1 Remove legacy `command` operation handler paths (install-command, uninstall-command operation handlers in `extensions/commands/operations/`) if they are no longer referenced — replaced by `CommandManager` methods
- [ ] 11.2 Remove legacy `mcp-server` operation handler paths (`extensions/mcp-servers/operations/`) if no longer referenced — replaced by `McpServerManager` methods
- [ ] 11.3 Remove any remaining duplicated lockfile/settings write calls from operation execution files (`extensions/skills/operations/`, `extensions/packs/operations/`) — shared operation workflows now own sequencing
- [ ] 11.4 Remove any remaining duplicated source resolution/discovery orchestration from command handlers — command-family workflows now own these phases
- [ ] 11.5 Clean up unused imports, dead code, and now-empty files across `extensions/`, `cli-commands/`, and `workspace/`
- [ ] 11.6 Typecheck
- [ ] 11.7 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 11.8 Run `pnpm lint` for all packages, fix any errors
- [ ] 11.9 Run `pnpm test` for all packages, fix any failures
- [ ] 11.10 Run `pnpm test:e2e` for all packages, fix any failures
- [ ] 11.11 Kill any remaining vitest worker processes

## 12. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Full verification pass. **Depends on: all previous phases.**

- [ ] 12.1 Run `pnpm typecheck` — all packages must pass with zero errors
- [ ] 12.2 Run `pnpm lint` — all packages must pass with zero errors
- [ ] 12.3 Run `pnpm test` — all tests must pass
- [ ] 12.4 Run `pnpm test:e2e` — all e2e tests must pass
- [ ] 12.5 Verify shared contract tests exist: install writes lockfile parity across all manager types, uninstall removes lockfile parity, dependency-retention on uninstall, idempotent rerun safety, preview does not apply, warn prompting and `--force` bypass, error readiness blocks plan, inter-job blocking
- [ ] 12.6 Verify type-specific tests exist: skill native vs non-native branches, pack cross-type expansion/preservation (skill + command + mcp-server), pack uninstall pre-filter parity
- [ ] 12.7 Verify command workflow tests exist: `runInstallCommandWorkflow` phase order, `runUninstallCommandWorkflow` phase order, `--list` removal, `--agent` removal
- [ ] 12.8 Kill any remaining vitest worker processes
