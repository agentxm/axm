> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Phase 1a: Move git/ to core

> **Subagent:** Run this entire phase in a single subagent.

No dependencies on other phases. Can run in parallel with Phase 1b and Phase 1c.

- [x] 1.1 Create `packages/core/src/unstable/git/` directory with `index.ts` barrel
- [x] 1.2 Move `packages/cli/src/git/operations.ts` to `packages/core/src/unstable/git/operations.ts`
- [x] 1.3 Move `packages/cli/src/git/operations.test.ts` to `packages/core/src/unstable/git/operations.test.ts`, update imports
- [x] 1.4 Add `./unstable/git` export entry to `packages/core/package.json`
- [x] 1.5 Update all CLI imports of `../git/` or `../../git/` to `@axm.sh/core/unstable/git`
- [x] 1.6 Remove `packages/cli/src/git/` directory
- [x] 1.7 Run `pnpm typecheck` — fix any errors
- [x] 1.8 Run `pnpm lint` — fix any errors
- [x] 1.9 Run `pnpm test` — fix any failures
- [x] 1.10 Run `pnpm test:e2e` — fix any failures
- [x] 1.11 Kill any lingering vitest worker processes

## 2. Phase 1b: Move registry/ to core

> **Subagent:** Run this entire phase in a single subagent.

No dependencies on other phases. Can run in parallel with Phase 1a and Phase 1c.

- [x] 2.1 Create `packages/core/src/unstable/registry/` directory with `index.ts` barrel
- [x] 2.2 Move `packages/cli/src/registry/client.ts`, `client-remote.ts`, `local-client.ts`, `local-schema.ts`, `utils.ts` to `packages/core/src/unstable/registry/`
- [x] 2.3 Move corresponding test files to `packages/core/src/unstable/registry/`, update imports
- [x] 2.4 Add `./unstable/registry` export entry to `packages/core/package.json`
- [x] 2.5 Update all CLI imports of `../registry/` or `../../registry/` to `@axm.sh/core/unstable/registry`
- [x] 2.6 Remove `packages/cli/src/registry/` directory
- [x] 2.7 Run `pnpm typecheck` — fix any errors
- [x] 2.8 Run `pnpm lint` — fix any errors
- [x] 2.9 Run `pnpm test` — fix any failures
- [x] 2.10 Run `pnpm test:e2e` — fix any failures
- [x] 2.11 Kill any lingering vitest worker processes

## 3. Phase 1c: Move auth/ business logic to core

> **Subagent:** Run this entire phase in a single subagent.

No dependencies on other phases. Can run in parallel with Phase 1a and Phase 1b.

- [x] 3.1 Create `packages/core/src/unstable/auth/` directory with `index.ts` barrel
- [x] 3.2 Move `packages/cli/src/auth/schema.ts`, `credential-store.ts`, `auth-client.ts`, `auth-middleware.ts`, `token-resolution.ts`, `device-login.ts`, `oauth-contract.ts` to `packages/core/src/unstable/auth/`
- [x] 3.3 Move corresponding test files to `packages/core/src/unstable/auth/`, update imports
- [x] 3.4 Add `./unstable/auth` export entry to `packages/core/package.json`
- [x] 3.5 Update all CLI imports of the moved auth modules to `@axm.sh/core/unstable/auth`
- [x] 3.6 Verify `login-interaction.ts` and `guard.ts` remain in `packages/cli/src/auth/` and import from `@axm.sh/core/unstable/auth`
- [x] 3.7 Remove moved files from `packages/cli/src/auth/` (keep `login-interaction.ts`, `guard.ts`, and their `index.ts`)
- [x] 3.8 Run `pnpm typecheck` — fix any errors
- [x] 3.9 Run `pnpm lint` — fix any errors
- [x] 3.10 Run `pnpm test` — fix any failures
- [x] 3.11 Run `pnpm test:e2e` — fix any failures
- [x] 3.12 Kill any lingering vitest worker processes

> **Parallelization:** Phases 1, 2, 3 are independent — launch as parallel subagents.

## 4. Phase 2a: Move workspace/ to core (with resolvePlan decomposition)

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phases 1a, 1b, 1c (all Phase 1 subagents must complete).

- [x] 4.1 Create `packages/core/src/unstable/workspace/` directory with `index.ts` barrel
- [x] 4.2 Move `packages/cli/src/workspace/plan.ts` to `packages/core/src/unstable/workspace/plan.ts` — pure data types, no changes needed
- [x] 4.3 Move `packages/cli/src/workspace/apply-plan.ts` to `packages/core/src/unstable/workspace/apply-plan.ts`, update imports to use core paths
- [x] 4.4 Move `packages/cli/src/workspace/apply-plan.test.ts` to core, update imports
- [x] 4.5 Extract `scanPlanReadiness` as a new pure function in `packages/core/src/unstable/workspace/scan-plan-readiness.ts` — write tests first (red), then implement (green)
- [x] 4.6 Refactor `augmentPlanWithReconciliation` in `packages/cli/src/workspace/service.ts`: remove `renderer` parameter, return `AugmentedPlanResult { plan: Plan; reconciliationTriggered: boolean; reason?: "missing" | "invalid" }` — write tests first for the new return type
- [x] 4.7 Move the refactored `augmentPlanWithReconciliation` to `packages/core/src/unstable/workspace/augment-plan.ts`
- [x] 4.8 Move `packages/cli/src/workspace/reconciliation.ts`, `reconciliation-types.ts`, `taxonomy-types.ts`, `classifier.ts`, `classifier-records.ts`, `source-metadata.ts`, `paths.ts`, `scope.ts`, `plan-bridge.ts` to `packages/core/src/unstable/workspace/` (NOTE: `builtin-packs.ts` and `initialization.ts` kept in CLI due to CLI-only dependencies)
- [x] 4.9 Move corresponding test files, update imports
- [x] 4.10 Move `WorkspaceContextService` interface and `Workspace` tag to `packages/core/src/unstable/workspace/service.ts` — remove `resolvePlan` from interface, remove `resolvePlan` method implementation, remove `displayPlan` import (NOTE: full service implementation remains in CLI due to extension path dependencies)
- [x] 4.11 Create `packages/cli/src/workspace/resolve-plan.ts` — the CLI free function implementing `resolvePlan` using core's `augmentPlan`, `scanPlanReadiness`, `applyPlan`, and CLI's `displayPlan`
- [x] 4.12 Update `packages/cli/src/workspace/display-plan.ts` to import plan types from `@axm.sh/core/unstable/workspace`
- [x] 4.13 Update all ~15 CLI call sites: change `ws.resolvePlan(plan, flags)` to `resolvePlan(plan, flags)` (import from `../workspace/resolve-plan.js`)
- [x] 4.14 Add `./unstable/workspace` export entry to `packages/core/package.json`
- [x] 4.15 Update all CLI imports of workspace modules to `@axm.sh/core/unstable/workspace`
- [x] 4.16 Clean up `packages/cli/src/workspace/` — files kept in CLI: `service.ts` (implementation), `resolve-plan.ts`, `display-plan.ts`, `display-plan.test.ts`, `resolve-plan-architecture.test.ts`, `test-stubs.ts`, `service.test.ts`, `builtin-packs.ts`, `initialization.ts`, `index.ts`
- [x] 4.17 Run `pnpm typecheck` — fix any errors
- [x] 4.18 Run `pnpm lint` — fix any errors
- [x] 4.19 Run `pnpm test` — fix any failures
- [x] 4.20 Run `pnpm test:e2e` — fix any failures
- [x] 4.21 Kill any lingering vitest worker processes

## 5. Phase 2b: Move sources/ and discoverSkillsInDir to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phase 4 (workspace must be in core first, since sources depends on Workspace).

- [x] 5.1 Create `packages/core/src/unstable/source-resolution/` directory with `index.ts` barrel
- [x] 5.2 Move `packages/cli/src/root/skills/install/discover-skills.ts` to `packages/core/src/unstable/source-resolution/discover-skills.ts` (or `unstable/skill-discovery/`)
- [x] 5.3 Move `packages/cli/src/root/skills/install/discover-skills.test.ts` alongside it, update imports
- [x] 5.4 Move `packages/cli/src/sources/service.ts`, `resolve-source.ts`, `resolve-source-pattern.ts` to `packages/core/src/unstable/source-resolution/`
- [x] 5.5 Move `packages/cli/src/sources/providers/` (all provider files: `git.ts`, `git-hosting.ts`, `local.ts`, `builtin.ts`, `index.ts`, `registry/`) to `packages/core/src/unstable/source-resolution/providers/`
- [x] 5.6 Move corresponding test files, update imports
- [x] 5.7 Update all provider imports of `discoverSkillsInDir` to use the new core location
- [x] 5.8 Update all provider imports of git, registry, workspace to use `@axm.sh/core/unstable/*` paths
- [x] 5.9 Add `./unstable/source-resolution` export entry to `packages/core/package.json`
- [x] 5.10 Update all CLI imports of source modules to `@axm.sh/core/unstable/source-resolution`
- [x] 5.11 Remove `packages/cli/src/sources/` directory
- [x] 5.12 Remove `packages/cli/src/root/skills/install/discover-skills.ts` and its test (verify no other CLI code imports it directly)
- [x] 5.13 Run `pnpm typecheck` — fix any errors
- [x] 5.14 Run `pnpm lint` — fix any errors
- [x] 5.15 Run `pnpm test` — fix any failures
- [x] 5.16 Run `pnpm test:e2e` — fix any failures
- [x] 5.17 Kill any lingering vitest worker processes

## 6. Phase 3a: Extract CodingAgentRepository interface to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phase 4 (workspace in core — agents module in core already exists).

- [x] 6.1 Define `CodingAgentRepository` service interface in `packages/core/src/unstable/agents/` — write the interface type with methods needed by extension managers (agent listing, skills directory paths)
- [x] 6.2 Export the interface from `@axm.sh/core/unstable/agents` barrel
- [x] 6.3 Update `packages/cli/src/agents/coding-agent.ts` and `repository.ts` to implement the core interface
- [x] 6.4 Run `pnpm typecheck` — fix any errors
- [x] 6.5 Run `pnpm lint` — fix any errors
- [x] 6.6 Run `pnpm test` — fix any failures
- [x] 6.7 Kill any lingering vitest worker processes

## 7. Phase 3b: Move extensions/ to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phases 4, 5, 6 (workspace, sources, and CodingAgentRepository interface must be in core).

> **Parallelization:** Tasks 7.2, 7.3, 7.4, 7.5 are independent — launch as parallel subagents if desired.

- [x] 7.1 Create `packages/core/src/unstable/extension-managers/` directory with `index.ts` barrel
- [x] 7.2 Move `packages/cli/src/extensions/skills/` (manager.ts, operations/, paths.ts, reconciliation-adapter.ts, utils.ts) to `packages/core/src/unstable/extension-managers/skills/`, update imports to use core paths for workspace, registry, sources, agents (layers.ts stays in CLI — wires CLI command-actions)
- [x] 7.3 Move `packages/cli/src/extensions/packs/` (manager.ts, operations/, paths.ts, reconciliation-adapter.ts, expansion.ts) to `packages/core/src/unstable/extension-managers/packs/` (layers.ts stays in CLI)
- [x] 7.4 Move `packages/cli/src/extensions/commands/` (manager.ts, operations/, reconciliation-adapter.ts) to `packages/core/src/unstable/extension-managers/commands/` (layers.ts stays in CLI)
- [x] 7.5 Move `packages/cli/src/extensions/mcp-servers/` (manager.ts, operations/, reconciliation-adapter.ts) to `packages/core/src/unstable/extension-managers/mcp-servers/` (layers.ts stays in CLI)
- [x] 7.6 Move `packages/cli/src/extensions/index.ts` (registry ref builders) to core
- [x] 7.7 Move all corresponding test files, update imports
- [x] 7.8 Update extension manager imports of `CodingAgentRepository` to use the core interface (not the concrete `DefaultCodingAgentRepository`) — moved service tag to core, extension managers yield `CodingAgentRepository` service
- [x] 7.9 Add `./unstable/extension-managers` export entry to `packages/core/package.json`
- [x] 7.10 Update all CLI imports of extension modules to `@axm.sh/core/unstable/extension-managers`
- [x] 7.11 Retain CLI `layers.ts` files (wire CLI command-actions to core manager layers) — CLI extensions/ directory kept for layers only
- [x] 7.12 Run `pnpm typecheck` — fix any errors
- [x] 7.13 Run `pnpm lint` — fix any errors
- [x] 7.14 Run `pnpm test` — fix any failures
- [x] 7.15 Run `pnpm test:e2e` — fix any failures
- [x] 7.16 Kill any lingering vitest worker processes

## 8. Phase 3c: Move operation workflows to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phase 7 (extension managers must be in core, since operation workflows use ExtensionManager types).

- [x] 8.1 Create `packages/core/src/unstable/extension-operations/` directory with `index.ts` barrel
- [x] 8.2 Move `packages/cli/src/workflows/install-operation/workflow.ts` to `packages/core/src/unstable/extension-operations/install-operation.ts`, update imports
- [x] 8.3 Move `packages/cli/src/workflows/uninstall-operation/workflow.ts` to `packages/core/src/unstable/extension-operations/uninstall-operation.ts`, update imports
- [x] 8.4 Move corresponding test files, update imports
- [x] 8.5 Add `./unstable/extension-operations` export entry to `packages/core/package.json`
- [x] 8.6 Update CLI imports of operation workflow types (`ExtensionManager`, `ExtensionTarget`, `buildInstallOperation`, `buildUninstallOperation`) to `@axm.sh/core/unstable/extension-operations`
- [x] 8.7 Remove `packages/cli/src/workflows/install-operation/` and `uninstall-operation/` directories
- [x] 8.8 Run `pnpm typecheck` — fix any errors
- [x] 8.9 Run `pnpm lint` — fix any errors
- [x] 8.10 Run `pnpm test` — fix any failures
- [x] 8.11 Run `pnpm test:e2e` — fix any failures
- [x] 8.12 Kill any lingering vitest worker processes

## 9. Final verification

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** All previous phases.

- [x] 9.1 Verify `packages/core/package.json` has all new export entries: `unstable/git`, `unstable/registry`, `unstable/auth`, `unstable/workspace`, `unstable/source-resolution`, `unstable/extension-managers`, `unstable/extension-operations`
- [x] 9.2 Verify no CLI source files import from moved directories via relative paths (grep for old import patterns)
- [x] 9.3 Verify no core source files import from `@axm.sh/cli` or use relative paths outside `packages/core/`
- [x] 9.4 Verify CLI retains only: `root/`, `workflows/install-command/`, `workflows/uninstall-command/`, `workspace/resolve-plan.ts`, `workspace/display-plan.ts`, `auth/login-interaction.ts`, `auth/guard.ts`, `builtin-pack/`, `dev-cli-commands/`, `cli-flags/`, `agents/` (implementations), `runtime/`, entry points
- [x] 9.5 Run full `pnpm build` — verify both packages build cleanly
- [x] 9.6 Run full `pnpm typecheck` — zero errors
- [x] 9.7 Run full `pnpm lint` — zero errors
- [x] 9.8 Run full `pnpm test` — all tests pass
- [x] 9.9 Run full `pnpm test:e2e` — all E2E tests pass
- [x] 9.10 Kill any lingering vitest worker processes

## 10. Remove backward-compat re-export barrels and dead duplicates

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** All previous phases.

- [x] 10.1 Delete `packages/cli/src/sources/index.ts` — pure re-export barrel. Update all ~40 CLI consumers to import directly from `@axm.sh/core/unstable/source-resolution`
- [x] 10.2 Delete `packages/cli/src/auth/index.ts` — re-export barrel. Update the 2 consumers of `withAuthGuard` to import from `../auth/guard.js` (or appropriate relative path)
- [x] 10.3 Delete `packages/cli/src/workspace/index.ts` — re-export barrel. Update all ~40 CLI consumers: core types (`Workspace`, `Plan`, `WorkspaceScope`, etc.) import from `@axm.sh/core/unstable/workspace`; CLI-only exports (`layer`) import from `./service.js` or `../workspace/service.js`; `resolvePlan` from `./resolve-plan.js` or `../workspace/resolve-plan.js`
- [x] 10.4 Delete `packages/cli/src/extensions/registry-ref-builders.ts` and `packages/cli/src/extensions/index.ts` — dead duplicates of core's `extension-managers/registry-ref-builders.ts`. Update any consumers to import from `@axm.sh/core/unstable/extension-managers`
- [x] 10.5 Delete dead duplicate extension files from CLI: `extensions/skills/manager.ts`, `paths.ts`, `utils.ts`, `reconciliation-adapter.ts`, `manager.test.ts`, `paths.test.ts`, `utils.test.ts` — already exist in core's `extension-managers/skills/`
- [x] 10.6 Delete dead duplicate extension files: `extensions/packs/manager.ts`, `paths.ts`, `reconciliation-adapter.ts`, `expansion.ts`, `manager.test.ts`, `expansion.test.ts` — already in core
- [x] 10.7 Delete dead duplicate extension files: `extensions/commands/manager.ts`, `reconciliation-adapter.ts`, `manager.test.ts` — already in core
- [x] 10.8 Delete dead duplicate extension files: `extensions/mcp-servers/manager.ts`, `reconciliation-adapter.ts`, `manager.test.ts` — already in core
- [x] 10.9 Delete dead duplicate `extensions/examples.test.ts` — already in core
- [x] 10.10 Delete dead duplicate workspace files from CLI: `plan.ts`, `apply-plan.ts`, `apply-plan.test.ts`, `classifier.ts`, `classifier.test.ts`, `classifier-records.ts`, `paths.ts`, `paths.test.ts`, `scope.ts`, `reconciliation-types.ts`, `taxonomy-types.ts`, `source-metadata.ts`, `plan-bridge.ts` — already exist in core's `unstable/workspace/`
- [x] 10.11 Update any remaining imports of deleted files to point to core equivalents
- [x] 10.12 Run `pnpm typecheck` — fix any errors
- [x] 10.13 Run `pnpm lint` — fix any errors
- [x] 10.14 Run `pnpm test` — fix any failures
- [x] 10.15 Run `pnpm test:e2e` — fix any failures
- [x] 10.16 Kill any lingering vitest worker processes

## 11. Move agents/ module to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phase 10.

- [x] 11.1 Move `packages/cli/src/agents/constants.ts` to `packages/core/src/unstable/agents/constants.ts` — pure path helpers (homedir, XDG config)
- [x] 11.2 Move `packages/cli/src/agents/mcp-sync.ts` and `mcp-sync.test.ts` to `packages/core/src/unstable/agents/mcp-sync.ts` — pure MCP config sync logic
- [x] 11.3 Move agent service implementations to `packages/core/src/unstable/agents/`: `claude-code/service.ts`, `cursor/service.ts`, `codex/service.ts`, `gemini-cli/service.ts`, `github-copilot/service.ts`, `opencode/service.ts` — pure `CodingAgent` impls with no CLI deps
- [x] 11.4 Move `packages/cli/src/agents/repository.ts` and `repository.test.ts` to `packages/core/src/unstable/agents/repository.ts` — `DefaultCodingAgentRepository` implementation. Update to import agent services from core-local paths
- [x] 11.5 Move `packages/cli/src/agents/coding-agent.ts` and `coding-agent.test.ts` to core — merge with existing core agent types, keeping the `CodingAgentRepository` service tag in core
- [x] 11.6 Update `packages/core/src/unstable/agents/index.ts` barrel to export all moved modules
- [x] 11.7 Update all CLI imports of agent modules to `@axm.sh/core/unstable/agents`
- [x] 11.8 Remove `packages/cli/src/agents/` directory (keep only `index.ts` re-export if needed, or remove entirely)
- [x] 11.9 Run `pnpm typecheck` — fix any errors
- [x] 11.10 Run `pnpm lint` — fix any errors
- [x] 11.11 Run `pnpm test` — fix any failures
- [x] 11.12 Run `pnpm test:e2e` — fix any failures
- [x] 11.13 Kill any lingering vitest worker processes

## 12. Move remaining workspace service implementation to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phase 11.

- [x] 12.1 Move `packages/cli/src/workspace/service.ts` and `service.test.ts` to `packages/core/src/unstable/workspace/service.ts` — `WorkspaceContextService` implementation. Remove any CLI-specific imports (should be none after prior phases)
- [x] 12.2 Move `packages/cli/src/workspace/reconciliation.ts` and `reconciliation.test.ts` to core — adapter registration and lockfile state merging
- [x] 12.3 Move `packages/cli/src/workspace/builtin-packs.ts` to core — builtin pack materialization logic
- [x] 12.4 Move `packages/cli/src/workspace/initialization.ts` to core — workspace initialization logic
- [x] 12.5 Update `packages/core/src/unstable/workspace/index.ts` barrel to export all moved modules including the `layer` (workspace live layer)
- [x] 12.6 Update all CLI imports of `workspace/service.js` to `@axm.sh/core/unstable/workspace`
- [x] 12.7 Clean up `packages/cli/src/workspace/` — should retain only `resolve-plan.ts`, `display-plan.ts`, `display-plan.test.ts`, `resolve-plan-architecture.test.ts`, `test-stubs.ts`
- [x] 12.8 Run `pnpm typecheck` — fix any errors
- [x] 12.9 Run `pnpm lint` — fix any errors
- [x] 12.10 Run `pnpm test` — fix any failures
- [x] 12.11 Run `pnpm test:e2e` — fix any failures
- [x] 12.12 Kill any lingering vitest worker processes

## 13. Move auth interaction and guard to core

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phase 10.

- [x] 13.1 Move `packages/cli/src/auth/login-interaction.ts` to `packages/core/src/unstable/auth/login-interaction.ts` — platform-aware browser launch and clipboard. Uses `child_process.spawn`, no CliRenderer/CliPrompt
- [x] 13.2 Move `packages/cli/src/auth/guard.ts` and `guard.test.ts` to `packages/core/src/unstable/auth/guard.ts` — auth flow orchestration using `CliPrompt`, `isNonInteractive`, `runDeviceLogin` (all already in core)
- [x] 13.3 Update `packages/core/src/unstable/auth/index.ts` barrel to export moved modules
- [x] 13.4 Update all CLI imports of auth modules to `@axm.sh/core/unstable/auth`
- [x] 13.5 Remove `packages/cli/src/auth/` directory entirely
- [x] 13.6 Run `pnpm typecheck` — fix any errors
- [x] 13.7 Run `pnpm lint` — fix any errors
- [x] 13.8 Run `pnpm test` — fix any failures
- [x] 13.9 Run `pnpm test:e2e` — fix any failures
- [x] 13.10 Kill any lingering vitest worker processes

## 14. Final cleanup and verification

> **Subagent:** Run this entire phase in a single subagent.

**Depends on:** Phases 11, 12, 13.

- [x] 14.1 Verify `packages/cli/src/` retains only: `root/` (command handlers), `workflows/install-command/` and `uninstall-command/`, `workspace/resolve-plan.ts` + `display-plan.ts` + tests + `test-stubs.ts`, `builtin-pack/`, `cli-flags/`, `runtime/`, `telemetry/`, `extensions/*/layers.ts` + `extensions/*/operations/`, entry points (`main.ts`, `app.ts`, `runtime.ts`, `help.ts`, `version.ts`, `output.ts`)
- [x] 14.2 Verify no dead re-export barrels remain in CLI
- [x] 14.3 Verify no core source files import from `@axm.sh/cli`
- [x] 14.4 Run full `pnpm build` — both packages build cleanly
- [x] 14.5 Run full `pnpm typecheck` — zero errors
- [x] 14.6 Run full `pnpm lint` — zero errors
- [x] 14.7 Run full `pnpm test` — all tests pass
- [x] 14.8 Run full `pnpm test:e2e` — all E2E tests pass
- [x] 14.9 Kill any lingering vitest worker processes
